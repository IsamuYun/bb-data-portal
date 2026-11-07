import { runSegment, type ExecEnv } from "@bb/shared";
import type { RunSegmentMessage } from "../lib/messages";

/**
 * Injected on demand by the background (registration: "runtime"), once per page load.
 * Receives a segment of recipe steps and runs it against the live DOM.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  main() {
    const w = window as unknown as { __bbInterpreterReady?: boolean };
    if (w.__bbInterpreterReady) return;
    w.__bbInterpreterReady = true;

    const start = performance.now();
    const env: ExecEnv = {
      document,
      location: window.location,
      scrollTo: (x, y) => window.scrollTo(x, y),
      scrollHeight: () => document.documentElement.scrollHeight,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Math.round(performance.now() - start),
      fetchMedia: async (url) => {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        });
        return { base64, mime: blob.type || "application/octet-stream" };
      },
      // Same-origin page APIs (e.g. cryobank /api/signedUrl) need the page's session cookies.
      fetchJson: async (url) => {
        const res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
        if (!res.ok) {
          const msg = await res.json().then((b: { message?: string }) => b?.message, () => undefined);
          throw new Error(`HTTP ${res.status}${msg ? ` ${msg}` : ""}`);
        }
        return res.json();
      },
      // Pages behind a consent form (e.g. Fairfax photo sets): fetched in page context so the session cookie applies.
      fetchDocument: async (url, init) => {
        const res = await fetch(url, {
          credentials: "include",
          ...(init ? { method: init.method, body: init.body, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get("content-type") ?? "";
        if (!/text\/html|application\/xhtml/i.test(contentType)) {
          void res.body?.cancel();
          return { url: res.url || url, contentType };
        }
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        return { url: res.url || url, contentType, doc };
      },
    };

    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
      const m = msg as RunSegmentMessage;
      if (!m || m.type !== "bb:run") return;
      const e = m.fetchMedia ? env : { ...env, fetchMedia: undefined };
      runSegment(m.steps, m.ctx, e).then(sendResponse, (err) =>
        sendResponse({ status: "failed", data: m.ctx.data, media: [], logs: [], error: err instanceof Error ? err.message : String(err), emitted: false }),
      );
      return true; // async response
    });
  },
});
