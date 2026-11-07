import { recipeSchema, renderTemplate, splitOnNavigate, type EnqueueItem, type ExecContext, type LogEntry, type MediaRequest, type NextJobResponse } from "@bb/shared";
import { api, ApiError } from "../lib/api";
import type { ControlMessage, RunSegmentMessage, SegmentReply } from "../lib/messages";
import { getSettings, getState, setState } from "../lib/storage";

const ALARM = "bb-poll";
const POLL_EVERY_MS = 5000;
const IDLE_POLLS_BEFORE_SLEEP = 5; // ~25 s of fast polling, then the 30 s alarm takes over
const NAV_TIMEOUT_MS = 30000;

let busy = false;

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void bootstrap());
  browser.runtime.onStartup.addListener(() => void bootstrap());
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM) void tick();
  });
  browser.runtime.onMessage.addListener((msg: unknown, _s, sendResponse) => {
    const m = msg as ControlMessage;
    if (m?.type === "bb:tick") {
      void tick();
      sendResponse({ ok: true });
    } else if (m?.type === "bb:state") {
      getState().then(sendResponse);
      return true;
    }
    return false;
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    getState().then((s) => (s.workTabId === tabId ? setState({ workTabId: null }) : undefined));
  });
  void bootstrap();
});

async function bootstrap() {
  await browser.alarms.create(ALARM, { periodInMinutes: 0.5 });
  void tick();
}

const chromeVersion = () => navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1];
const extVersion = () => browser.runtime.getManifest().version;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One polling session: heartbeat, then run jobs until the queue is empty. */
async function tick() {
  if (busy) return;
  const settings = await getSettings();
  if (!settings.token) return setState({ phase: "unpaired" });
  if (settings.paused) return setState({ phase: "paused" });
  busy = true;
  try {
    let idle = 0;
    while (idle < IDLE_POLLS_BEFORE_SLEEP) {
      const s = await getSettings();
      if (s.paused || !s.token) break;
      await setState({ phase: "polling", lastPollAt: Date.now(), lastError: null });
      const hb = await api.heartbeat({ chromeVersion: chromeVersion(), extVersion: extVersion(), currentJobId: null });
      await setState({ serverStatus: hb.status });
      if (hb.status !== "active") {
        await setState({ phase: "paused" });
        break;
      }
      const next = await api.nextJob();
      if (!next.job || !next.recipe) {
        idle++;
        await setState({ phase: "idle" });
        await sleep(POLL_EVERY_MS);
        continue;
      }
      idle = 0;
      await runJob(next.job, next.recipe);
      const [lo, hi] = next.recipe.settings.delayMs;
      await sleep(rand(lo, hi));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setState({ phase: "error", lastError: msg, ...(e instanceof ApiError && e.status === 401 ? { serverStatus: "revoked" } : {}) });
  } finally {
    busy = false;
  }
}

async function runJob(job: NonNullable<NextJobResponse["job"]>, recipeRaw: NonNullable<NextJobResponse["recipe"]>) {
  const t0 = Date.now();
  const recipe = recipeSchema.parse(recipeRaw);
  const ctx: ExecContext = { job: { url: job.url, externalId: job.externalId, seed: job.seed }, data: {} };
  const logs: LogEntry[] = [];
  const media: MediaRequest[] = [];
  const enqueue: EnqueueItem[] = [];
  // Listing mode: a results page runs the listing steps and yields new jobs instead of a record.
  const listing = recipe.listing && new RegExp(recipe.listing.match).test(job.url) ? recipe.listing : null;
  const steps = listing ? listing.steps : recipe.steps;
  const segTimeout = listing ? listing.timeoutMs : recipe.settings.timeoutMs;
  const log = (level: LogEntry["level"], msg: string) => logs.push({ t: Date.now() - t0, level, msg });
  await setState({ phase: "running", currentJob: { id: job.id, url: job.url, startedAt: t0 } });

  let status: "done" | "failed" | "auth_required" | "skipped" = "failed";
  let error: string | undefined;
  try {
    const tabId = await getWorkTab();
    const segments = splitOnNavigate(steps);
    const matcher = new RegExp(listing ? listing.match : recipe.match);
    if (listing) log("info", "列表模式：翻页收集详情链接");
    let emitted = false;
    for (const seg of segments) {
      if (seg.url !== undefined) {
        const url = renderTemplate(seg.url, ctx);
        if (!matcher.test(url)) throw new Error(`URL 不匹配 ${listing ? "recipe.listing.match" : "recipe.match"}：${url}`);
        log("info", `navigate ${url}`);
        await navigate(tabId, url, recipe.settings.timeoutMs);
      }
      if (seg.steps.length === 0) continue;
      await browser.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/interpreter.js"] });
      // Media bytes are fetched here in the service worker (host permissions, no CORS), not in the page.
      const msg: RunSegmentMessage = { type: "bb:run", steps: seg.steps, ctx, fetchMedia: false };
      const reply = (await withTimeout(browser.tabs.sendMessage(tabId, msg), segTimeout, "页面执行超时")) as SegmentReply;
      for (const l of reply.logs) logs.push({ ...l, t: Date.now() - t0 });
      media.push(...reply.media);
      enqueue.push(...(reply.enqueue ?? []));
      ctx.data = reply.data;
      if (reply.status === "auth_required") {
        status = "auth_required";
        error = reply.error ?? "auth_required";
        break;
      }
      if (reply.status === "failed") throw new Error(reply.error ?? "执行失败");
      if (reply.emitted) {
        emitted = true;
        break;
      }
    }
    if (status !== "auth_required") {
      if (!emitted) log("warn", "Recipe 没有 emit 步骤，按已执行完处理");
      status = "done";
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    log("error", error);
    status = "failed";
  }

  const res = await api.result(job.id, {
    runId: job.runId,
    status,
    data: status === "done" ? ctx.data : undefined,
    error,
    logs,
    recipeVersion: recipe.version,
    durationMs: Date.now() - t0,
    mediaCount: media.filter((m) => m.base64).length,
    // Always present for a finished listing run (even empty), so the server never stores it as a record.
    enqueue: listing && status === "done" ? enqueue : undefined,
  });

  if (status === "done" && res.recordId) {
    for (const m of media) {
      try {
        // The page context may be blocked by CORS; the service worker has host permissions and is not.
        const blob = m.base64
          ? await (await fetch(`data:${m.mime ?? "application/octet-stream"};base64,${m.base64}`)).blob()
          : await fetchMediaInBackground(m.url);
        const form = new FormData();
        form.append("field", m.field);
        form.append("kind", m.kind);
        form.append("position", String(m.position));
        form.append("originalUrl", m.url);
        form.append("file", blob, `${m.field}-${m.position}`);
        await api.media(job.id, form);
      } catch (e) {
        await api.log(job.id, job.runId, [{ t: Date.now() - t0, level: "warn", msg: `媒体上传失败 ${m.url}: ${e instanceof Error ? e.message : e}` }]).catch(() => {});
      }
    }
  }

  const st = await getState();
  const stats = { ...st.stats };
  if (status === "done") stats.done++;
  else if (status === "auth_required") stats.authRequired++;
  else stats.failed++;
  await setState({ currentJob: null, stats, phase: status === "auth_required" ? "paused" : "polling", serverStatus: status === "auth_required" ? "paused" : st.serverStatus });
}


async function fetchMediaInBackground(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

async function getWorkTab(): Promise<number> {
  const st = await getState();
  if (st.workTabId != null) {
    try {
      await browser.tabs.get(st.workTabId);
      return st.workTabId;
    } catch {
      /* closed */
    }
  }
  const tab = await browser.tabs.create({ url: "about:blank", active: false });
  await setState({ workTabId: tab.id ?? null });
  return tab.id!;
}

/** Load `url` in the tab and resolve once Chrome reports the load complete. */
async function navigate(tabId: number, url: string, timeoutMs: number) {
  const done = new Promise<void>((resolve) => {
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") {
        browser.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(onUpdated);
  });
  await browser.tabs.update(tabId, { url });
  await withTimeout(done, Math.max(timeoutMs, NAV_TIMEOUT_MS), "页面加载超时");
  await sleep(300);
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
