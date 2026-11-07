/**
 * Headless device simulator: speaks the extension protocol against a server, executing recipes
 * with jsdom instead of Chrome. Useful for testing the server side and recipes for public pages
 * (no login state). Usage:
 *   tsx scripts/simulate-device.ts <serverUrl> <pairingCode|token> [maxJobs] [platformSlugs(comma-separated)]
 */
import { JSDOM } from "jsdom";
import { recipeSchema, renderTemplate, runSegment, splitOnNavigate, type ExecContext, type LogEntry, type MediaRequest, type NextJobResponse } from "../src";

const [server = "http://localhost:3000", cred = "", maxArg = "10", platformsArg = ""] = process.argv.slice(2);
const base = server.replace(/\/$/, "");
let token = cred.startsWith("bbd_") ? cred : "";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (typeof init.body === "string") headers.set("content-type", "application/json");
  const res = await fetch(base + path, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${path} → ${res.status} ${body.error ?? ""}`);
  return body;
}

if (!token) {
  const r = await call<{ token: string; name: string }>("/api/ext/devices/register", {
    method: "POST",
    body: JSON.stringify({ pairingCode: cred, name: "simulator (jsdom)", chromeVersion: "sim", extVersion: "0.2.0" }),
  });
  token = r.token;
  console.log("registered as", r.name, "token", token.slice(0, 10) + "…");
}

for (let n = 0; n < Number(maxArg); n++) {
  const hb = await call<{ status: string }>("/api/ext/devices/heartbeat", { method: "POST", body: JSON.stringify({ currentJobId: null }) });
  if (hb.status !== "active") {
    console.log("device status:", hb.status, "— stopping");
    break;
  }
  const next = await call<NextJobResponse>("/api/ext/jobs/next" + (platformsArg ? `?platforms=${encodeURIComponent(platformsArg)}` : ""));
  if (!next.job || !next.recipe) {
    console.log("no job");
    break;
  }
  const { job } = next;
  const recipe = recipeSchema.parse(next.recipe);
  const t0 = Date.now();
  const ctx: ExecContext = { job: { url: job.url, externalId: job.externalId, seed: job.seed }, data: {} };
  const logs: LogEntry[] = [];
  const media: MediaRequest[] = [];
  let status: "done" | "failed" | "auth_required" = "failed";
  let error: string | undefined;
  let dom: JSDOM | null = null;
  try {
    for (const seg of splitOnNavigate(recipe.steps)) {
      if (seg.url !== undefined) {
        const url = renderTemplate(seg.url, ctx);
        if (!new RegExp(recipe.match).test(url)) throw new Error(`URL 不匹配 recipe.match：${url}`);
        const res = await fetch(url, { redirect: "follow" });
        dom = new JSDOM(await res.text(), { url: res.url });
        logs.push({ t: Date.now() - t0, level: "info", msg: `navigate ${url} (${res.status})` });
      }
      if (!dom || seg.steps.length === 0) continue;
      const win = dom.window;
      const reply = await runSegment(seg.steps, ctx, {
        document: win.document,
        location: win.location,
        scrollTo: () => {},
        scrollHeight: () => 0,
        sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50))),
        now: () => Date.now() - t0,
        fetchMedia: async (u) => {
          const r = await fetch(u);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return { base64: Buffer.from(await r.arrayBuffer()).toString("base64"), mime: r.headers.get("content-type") ?? "application/octet-stream" };
        },
      });
      logs.push(...reply.logs);
      media.push(...reply.media);
      ctx.data = reply.data;
      if (reply.status === "auth_required") {
        status = "auth_required";
        error = reply.error;
        break;
      }
      if (reply.status === "failed") throw new Error(reply.error);
      if (reply.emitted) break;
    }
    if (status !== "auth_required") status = "done";
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    logs.push({ t: Date.now() - t0, level: "error", msg: error });
  }
  const res = await call<{ jobStatus: string; recordId: string | null }>(`/api/ext/jobs/${job.id}/result`, {
    method: "POST",
    body: JSON.stringify({ runId: job.runId, status, data: status === "done" ? ctx.data : undefined, error, logs, recipeVersion: recipe.version, durationMs: Date.now() - t0 }),
  });
  let uploaded = 0;
  if (status === "done" && res.recordId) {
    for (const m of media) {
      if (!m.base64) continue;
      const form = new FormData();
      form.append("field", m.field);
      form.append("kind", m.kind);
      form.append("position", String(m.position));
      form.append("originalUrl", m.url);
      form.append("file", new Blob([Buffer.from(m.base64, "base64")], { type: m.mime }), `${m.field}-${m.position}`);
      const r = await call<{ mediaId: string; deduped: boolean }>(`/api/ext/jobs/${job.id}/media`, { method: "POST", body: form });
      uploaded += r.deduped ? 0 : 1;
    }
  }
  console.log(`job ${job.externalId ?? job.id} → ${status} (server: ${res.jobStatus}) record=${res.recordId ?? "-"} fields=${Object.keys(ctx.data).length} media=${uploaded}/${media.length}${error ? " error=" + error : ""}`);
  // Polite crawling: honour the recipe's delay between jobs.
  const [lo, hi] = recipe.settings.delayMs;
  await new Promise((r) => setTimeout(r, lo + Math.random() * (hi - lo)));
}
