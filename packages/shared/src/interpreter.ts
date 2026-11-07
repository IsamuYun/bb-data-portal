import { pageToJson } from "./page-json";
import type { FieldRule, RecipeStep } from "./recipe";

/**
 * Recipe interpreter: runs a slice of steps against a live Document.
 * Pure w.r.t. the environment: navigation, sleeping and fetching are delegated to `env`,
 * so the same code runs inside a content script and under jsdom in tests.
 *
 * `navigate` steps are NOT executed here. The caller (extension background) splits the
 * step list on `navigate`, drives the tab, then runs each segment in the loaded page.
 */

export type LogEntry = { t: number; level: "info" | "warn" | "error"; msg: string };
export type MediaRequest = { field: string; kind: string; url: string; position: number; base64?: string; mime?: string; error?: string };

export type ExecContext = {
  job: { url: string; externalId: string | null; seed: Record<string, unknown> | null };
  /** Data accumulated by earlier segments. */
  data: Record<string, unknown>;
};

export type ExecEnv = {
  document: Document;
  location: { href: string };
  scrollTo: (x: number, y: number) => void;
  scrollHeight: () => number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Fetch a URL in page context and return base64 + mime. Undefined → media is recorded by URL only. */
  fetchMedia?: (url: string) => Promise<{ base64: string; mime: string }>;
  /** GET a JSON document with the page's cookies. Required by `fetchJson` steps. */
  fetchJson?: (url: string) => Promise<unknown>;
  /**
   * GET (or form-POST) a URL with the page's cookies. HTML responses come back parsed (`doc`); anything else only
   * reports its final URL and content type. Required by `fetchDocument` steps.
   */
  fetchDocument?: (url: string, init?: { method: "POST"; body: string }) => Promise<FetchedDocument>;
};

export type FetchedDocument = { url: string; contentType: string; doc?: Document };

export type SegmentResult = {
  status: "ok" | "failed" | "auth_required";
  data: Record<string, unknown>;
  media: MediaRequest[];
  logs: LogEntry[];
  error?: string;
  /** True when an `emit` step ran; the caller finalises the job. */
  emitted: boolean;
  /** New jobs requested by `enqueue` steps (listing pages). */
  enqueue?: EnqueueItem[];
};

export type EnqueueItem = { url: string; externalId: string };

export function splitOnNavigate(steps: RecipeStep[]): { url?: string; steps: RecipeStep[] }[] {
  const segs: { url?: string; steps: RecipeStep[] }[] = [];
  let cur: { url?: string; steps: RecipeStep[] } = { steps: [] };
  for (const s of steps) {
    if (s.op === "navigate") {
      if (cur.steps.length || cur.url !== undefined) segs.push(cur);
      cur = { url: s.url, steps: [] };
    } else cur.steps.push(s);
  }
  segs.push(cur);
  return segs;
}

/** Value at a dot path ("data.0.signedUrl"); array indexes are plain numbers. */
export function pickPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

/** `{{job.url}}`, `{{job.seed.foo}}`, `{{data.title}}`; filter `|pad:6` left-pads with zeros (19161 → 019161). */
export function renderTemplate(tpl: string, ctx: ExecContext): string {
  return tpl.replace(/\{\{\s*([\w.-]+)\s*(?:\|\s*pad:(\d+)\s*)?\}\}/g, (_, path: string, pad?: string) => {
    const v = pickPath(ctx, path);
    const s = v == null ? "" : String(v);
    return pad && s ? s.padStart(Number(pad), "0") : s;
  });
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** querySelectorAll with one `:contains('text')` pseudo-class supported anywhere in the chain. */
export function query(root: ParentNode, selector: string): Element[] {
  const m = selector.match(/^(.*?):contains\((['"])(.*?)\2\)(.*)$/);
  if (!m) return Array.from(root.querySelectorAll(selector));
  const [, prefix, , text, suffix] = m;
  const base = prefix.trim() || "*";
  const needle = text.toLowerCase();
  const hits = Array.from(root.querySelectorAll(base)).filter((el) => norm(el.textContent).toLowerCase().includes(needle));
  if (!suffix.trim()) return hits;
  return hits.flatMap((el) => query(el, suffix.trim()));
}

const LABEL_TAGS = "dt,th,td,label,strong,b,span,div,p,li,h2,h3,h4";

/** Find the value shown next to a label ("Height" → "6'1\""). */
export function findByLabel(doc: Document, label: string): Element | string | null {
  const want = norm(label).toLowerCase().replace(/:$/, "");
  const els = Array.from(doc.querySelectorAll(LABEL_TAGS)) as HTMLElement[];
  // Prefer the smallest element whose own text is exactly the label (or "Label: value").
  for (const el of els) {
    const text = norm(el.textContent).toLowerCase();
    if (text !== want && !text.startsWith(want + ":")) continue;
    // Skip containers whose children carry the label (we'll hit the child later). This includes a block whose text
    // merely starts with "Label:" because its first child is the label (`<td><span>Height:</span><span>…`).
    const carries = (c: Element) => {
      const ct = norm(c.textContent).toLowerCase();
      return ct === want || ct.startsWith(want + ":");
    };
    if (Array.from(el.children).some(carries)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === "dt") {
      const dd = nextElement(el, "dd");
      if (dd) return dd;
    }
    if (tag === "th" || tag === "td") {
      const next = nextElement(el, "td,th");
      if (next) return next;
    }
    if (text.startsWith(want + ":") && text.length > want.length + 1) {
      return norm(el.textContent).slice(want.length + 1).trim();
    }
    if (el.nextElementSibling) return el.nextElementSibling;
    // "Label" in a child element, value is the rest of the parent's text.
    const parent = el.parentElement;
    if (parent) {
      const rest = norm(parent.textContent).replace(new RegExp("^" + escapeRe(norm(el.textContent)) + ":?\\s*", "i"), "");
      if (rest) return rest;
      if (parent.nextElementSibling) return parent.nextElementSibling;
    }
  }
  return null;
}

function nextElement(el: Element, selector: string): Element | null {
  let n = el.nextElementSibling;
  while (n) {
    if (n.matches(selector)) return n;
    n = n.nextElementSibling;
  }
  return null;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function readValue(el: Element | string, attr: string | undefined): string {
  if (typeof el === "string") return el;
  if (!attr || attr === "textContent") return el.textContent ?? "";
  if (attr === "innerText") return (el as HTMLElement).innerText ?? el.textContent ?? "";
  if (attr === "innerHTML") return el.innerHTML;
  if (attr === "src" || attr === "href") {
    const v = (el as HTMLImageElement).src ?? (el as HTMLAnchorElement).href;
    return typeof v === "string" && v ? v : (el.getAttribute(attr) ?? "");
  }
  return el.getAttribute(attr) ?? "";
}

function applyRule(doc: Document, rule: FieldRule): unknown {
  let targets: (Element | string)[] = [];
  if (rule.selector) targets = query(doc, rule.selector);
  else if (rule.label) {
    const v = findByLabel(doc, rule.label);
    targets = v == null ? [] : [v];
  }
  if (!rule.all) targets = targets.slice(0, 1);
  let vals = targets
    .map((t) => readValue(t, rule.attr))
    .map((v) => (rule.trim === false ? v : norm(v)))
    .map((v) => {
      if (!rule.regex) return v;
      const m = v.match(new RegExp(rule.regex));
      return m ? (m[1] ?? m[0]) : "";
    })
    .filter((v) => v !== "");
  if (rule.unique) vals = [...new Set(vals)];
  if (rule.split) {
    const parts = vals.flatMap((v) => v.split(rule.split!)).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : (rule.default ?? []);
  }
  if (rule.all && rule.join !== undefined) return vals.length ? vals.join(rule.join) : (rule.default ?? null);
  if (rule.all) return vals.length ? vals : (rule.default ?? []);
  return vals.length ? vals[0] : (rule.default ?? null);
}

export async function runSegment(steps: RecipeStep[], ctx: ExecContext, env: ExecEnv): Promise<SegmentResult> {
  const logs: LogEntry[] = [];
  const log = (level: LogEntry["level"], msg: string) => logs.push({ t: env.now(), level, msg });
  const data: Record<string, unknown> = { ...ctx.data };
  const media: MediaRequest[] = [];
  const enqueue: EnqueueItem[] = [];
  let emitted = false;

  for (const step of steps) {
    try {
      switch (step.op) {
        case "navigate":
          throw new Error("navigate must be handled by the caller");
        case "waitFor": {
          const deadline = env.now() + (step.timeoutMs ?? 15000);
          let found = true;
          while (query(env.document, step.selector).length === 0) {
            if (env.now() >= deadline) {
              if (!step.optional) {
                // Say what the page was instead (login wall, removed profile, error page…): the selector alone does not.
                const title = norm(env.document.title).slice(0, 80);
                const head = norm(query(env.document, "h1, h2, .title")[0]?.textContent).slice(0, 80);
                throw new Error(`waitFor 超时：${step.selector}（页面：${title || "无标题"}${head ? ` · ${head}` : ""} · ${env.location.href}）`);
              }
              found = false;
              break;
            }
            await env.sleep(250);
          }
          log(found ? "info" : "warn", found ? `waitFor ok: ${step.selector}` : `waitFor 超时（可选，继续）：${step.selector}`);
          break;
        }
        case "click": {
          const el = query(env.document, step.selector)[0] as HTMLElement | undefined;
          if (!el) {
            if (step.optional) {
              log("warn", `click 跳过（未找到）：${step.selector}`);
              break;
            }
            throw new Error(`click 未找到元素：${step.selector}`);
          }
          el.click();
          log("info", `click: ${step.selector}`);
          await env.sleep(300);
          break;
        }
        case "scroll": {
          for (let i = 0; i < step.times; i++) {
            env.scrollTo(0, step.to === "top" ? 0 : env.scrollHeight());
            await env.sleep(step.delayMs);
          }
          break;
        }
        case "sleep":
          await env.sleep(step.ms);
          break;
        case "assertNotMatch": {
          if (new RegExp(step.urlPattern).test(env.location.href)) {
            log("error", `URL 命中 ${step.urlPattern}：${env.location.href}`);
            return { status: step.reason === "auth_required" ? "auth_required" : "failed", data, media, logs, error: step.reason, emitted, enqueue };
          }
          break;
        }
        case "extract": {
          let n = 0;
          for (const [key, rule] of Object.entries(step.fields)) {
            const v = applyRule(env.document, rule);
            data[key] = v;
            if (v != null && !(Array.isArray(v) && v.length === 0)) n++;
          }
          log("info", `extract: ${n}/${Object.keys(step.fields).length} 个字段有值`);
          break;
        }
        case "downloadMedia": {
          const raw = data[step.from];
          const urls = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter((u) => /^https?:\/\//.test(u));
          let pos = 0;
          for (const url of urls) {
            const req: MediaRequest = { field: step.from, kind: step.as, url, position: pos++ };
            if (env.fetchMedia) {
              try {
                const got = await env.fetchMedia(url);
                req.base64 = got.base64;
                req.mime = got.mime;
              } catch (e) {
                req.error = e instanceof Error ? e.message : String(e);
                log("warn", `媒体下载失败 ${url.split("?")[0]}: ${req.error}`);
              }
            }
            media.push(req);
          }
          if (step.drop) delete data[step.from];
          log("info", `downloadMedia: ${urls.length} 个 (${step.from})`);
          break;
        }
        case "fetchJson": {
          const url = new URL(renderTemplate(step.url, { ...ctx, data }), env.location.href).href;
          try {
            if (!env.fetchJson) throw new Error("运行环境不支持 fetchJson");
            const body = await env.fetchJson(url);
            const v = step.pick ? pickPath(body, step.pick) : body;
            if (v == null) throw new Error(`响应中没有 ${step.pick}`);
            data[step.into] = v;
            log("info", `fetchJson ok → ${step.into}`);
          } catch (e) {
            if (!step.optional) throw e;
            log("warn", `fetchJson 跳过（可选）${url.split("?")[0]}: ${e instanceof Error ? e.message : e}`);
          }
          break;
        }
        case "fetchDocument": {
          const rendered = renderTemplate(step.url, { ...ctx, data }).trim();
          const url = rendered ? new URL(rendered, env.location.href).href : "";
          try {
            if (!url) throw new Error(`URL 为空（${step.url}）`);
            if (!env.fetchDocument) throw new Error("运行环境不支持 fetchDocument");
            const got = await fetchWithConsent(env.fetchDocument, url, step.consent, log);
            if (!got.doc) {
              if (!step.binaryInto) throw new Error(`返回的不是 HTML（${got.contentType}）`);
              data[step.binaryInto] = [got.url];
              log("info", `fetchDocument: 直接返回文件 → ${step.binaryInto}`);
              break;
            }
            withBase(got.doc, got.url);
            if (step.snapshot) {
              media.push({ field: step.snapshot, kind: "doc", url: got.url, position: 0, base64: utf8Base64(snapshotHtml(got.doc)), mime: "text/html" });
              log("info", `fetchDocument: 已保存网页快照 → ${step.snapshot}`);
            }
            if (step.pageJson) {
              const blocks = pageToJson(got.doc);
              data[step.pageJson] = blocks;
              log("info", `fetchDocument: 页面结构化为 ${blocks.length} 个块 → ${step.pageJson}`);
            }
            let n = 0;
            for (const [key, rule] of Object.entries(step.fields)) {
              const v = applyRule(got.doc, rule);
              data[key] = v;
              if (v != null && !(Array.isArray(v) && v.length === 0)) n++;
            }
            log("info", `fetchDocument ok：${n}/${Object.keys(step.fields).length} 个字段有值`);
          } catch (e) {
            if (!step.optional) throw e;
            log("warn", `fetchDocument 跳过（可选）${url.split("?")[0]}: ${e instanceof Error ? e.message : e}`);
          }
          break;
        }
        case "paginate": {
          const acc = new Map<string, unknown[]>(Object.keys(step.fields).map((k) => [k, []]));
          const textOf = (sel?: string) => (sel ? norm(query(env.document, sel)[0]?.textContent) : "");
          /** Click `sel` and wait for the pager to move; false when the link is missing/disabled or nothing changed. */
          const turn = async (sel: string) => {
            const link = query(env.document, sel)[0] as HTMLElement | undefined;
            if (!link || (step.disabled && link.matches(step.disabled))) return false;
            const before = textOf(step.changed);
            link.click();
            let turned = !step.changed;
            for (const deadline = env.now() + step.timeoutMs; !turned && env.now() < deadline; ) {
              await env.sleep(250);
              turned = textOf(step.changed) !== before;
            }
            if (turned) await env.sleep(step.delayMs);
            return turned;
          };
          if (step.prev) {
            let back = 0;
            while (back < step.maxPages && (await turn(step.prev))) back++;
            if (back) log("info", `paginate: 先回退 ${back} 页到第一页`);
          }
          let page = 1;
          for (; ; page++) {
            for (const [key, rule] of Object.entries(step.fields)) {
              const v = applyRule(env.document, rule);
              acc.get(key)!.push(...(Array.isArray(v) ? v : v == null ? [] : [v]));
            }
            if (page >= step.maxPages) {
              log("warn", `paginate: 已达 maxPages=${step.maxPages}，停止翻页`);
              break;
            }
            const link = query(env.document, step.next)[0];
            if (!link || (step.disabled && link.matches(step.disabled))) break;
            if (!(await turn(step.next))) {
              log("warn", `paginate: 第 ${page} 页之后翻页无响应（${step.changed} 未变化），停止`);
              break;
            }
          }
          for (const [key, vals] of acc) data[key] = [...new Set(vals.map((v) => (typeof v === "string" ? v : JSON.stringify(v))))];
          log("info", `paginate: ${page} 页，${[...acc.keys()].map((k) => `${k} ${(data[k] as unknown[]).length} 个`).join("，")}`);
          break;
        }
        case "enqueue": {
          const raw = data[step.from];
          const items = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((v) => String(v).trim()).filter(Boolean);
          const seen = new Set(enqueue.map((e) => e.url));
          for (const item of items) {
            const rendered = renderTemplate(step.url, { ...ctx, data, item } as ExecContext);
            const url = new URL(rendered, env.location.href).href;
            if (!seen.has(url)) enqueue.push({ url, externalId: item }), seen.add(url);
          }
          log("info", `enqueue: ${items.length} 个（${step.from}）`);
          break;
        }
        case "emit":
          emitted = true;
          break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log("error", `${step.op} 失败：${msg}`);
      return { status: "failed", data, media, logs, error: msg, emitted, enqueue };
    }
  }
  return { status: "ok", data, media, logs, emitted, enqueue };
}

type FetchDocumentStep = Extract<RecipeStep, { op: "fetchDocument" }>;

/** The page as an offline document: no scripts, frames or trackers; `<base>` keeps its links resolvable. */
export function snapshotHtml(doc: Document): string {
  const copy = doc.cloneNode(true) as Document;
  copy.querySelectorAll("script, noscript, iframe, object, embed, link[rel=preload], link[rel=prefetch]").forEach((e) => e.remove());
  return "<!doctype html>\n" + copy.documentElement.outerHTML;
}

function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Make relative links in a fetched document resolve against the URL it came from, not the page that fetched it. */
function withBase(doc: Document, url: string) {
  let base = doc.querySelector("base");
  if (!base) {
    base = doc.createElement("base");
    (doc.head ?? doc.documentElement).prepend(base);
  }
  base.setAttribute("href", new URL(base.getAttribute("href") ?? "", url).href);
}

/** The form fields a browser would send when the user ticks the consent box and clicks submit. */
export function consentFormBody(form: Element): string {
  const body = new URLSearchParams();
  for (const i of Array.from(form.querySelectorAll("input")) as HTMLInputElement[]) {
    if (!i.name) continue;
    if (i.type === "hidden") body.set(i.name, i.value);
    else if (i.type === "checkbox") body.set(i.name, i.getAttribute("value") || "on");
  }
  const submit = form.querySelector("input[type=submit][name], button[type=submit][name]") as HTMLInputElement | null;
  if (submit) body.set(submit.name, submit.value);
  return body.toString();
}

async function fetchWithConsent(
  fetchDocument: NonNullable<ExecEnv["fetchDocument"]>,
  url: string,
  consent: FetchDocumentStep["consent"],
  log: (level: LogEntry["level"], msg: string) => void,
): Promise<FetchedDocument> {
  const first = await fetchDocument(url);
  const gate = consent && first.doc ? query(first.doc, consent.when)[0] : undefined;
  if (!consent || !gate) return first;
  if (!consent.accepted) throw new Error("页面要求同意条款，但 recipe 中 consent.accepted 未设为 true");
  const form = gate.closest("form") ?? first.doc!.querySelector("form");
  if (!form) throw new Error("同意页中找不到表单");
  const action = new URL(form.getAttribute("action") || first.url, first.url).href;
  log("info", "fetchDocument: 已按 recipe 设置提交同意表单");
  const second = await fetchDocument(action, { method: "POST", body: consentFormBody(form) });
  if (second.doc && query(second.doc, consent.when).length) throw new Error("提交同意表单后仍返回同意页");
  return second;
}
