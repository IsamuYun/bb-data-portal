import Anthropic from "@anthropic-ai/sdk";
import type { Fields } from "./core";

/** Translates a set of fields (keys kept, values in Chinese). Injectable so tests and offline runs need no API. */
export type Translator = ((fields: Fields, context: { platformName: string; labels: Record<string, string> }) => Promise<Fields>) & { model?: string };

const SYSTEM = `你是专业的中文译者，负责把精子库捐献者档案中的英文字段翻译成简体中文，供中文用户阅读。
规则：
- 输入是 JSON 对象，键是字段名，值是英文字符串或字符串数组；输出必须是结构完全相同的 JSON（相同的键、字符串对字符串、数组对数组且元素数量一致），不要增删键，不要输出其它文字。
- 以 "__dict:" 开头的键是固定词条（如族裔、专业、宗教），请给出简洁、规范的中文名词，不加解释。
- 翻译成自然、准确的简体中文；人名、品牌、血型（如 AB+）、基因检测名称、价格金额、单位数字保持原样，可在必要时保留英文原文于括号内。
- 简介等长文本按段落完整翻译，不要概括或省略。`;

function userPrompt(fields: Fields, ctx: { platformName: string; labels: Record<string, string> }) {
  const labels = Object.fromEntries(Object.keys(fields).map((k) => [k, ctx.labels[k.replace(/^__dict:([^:]+):\d+$/, "$1")] ?? k]));
  return `平台：${ctx.platformName}\n字段含义：${JSON.stringify(labels)}\n\n请翻译：\n${JSON.stringify(fields)}`;
}

/** Parse the model's JSON answer; any missing / malformed key falls back to the source value. */
function mergeAnswer(fields: Fields, text: string): Fields {
  const parsed = parseJsonAnswer(text) as Record<string, unknown>;
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    const t = parsed[k];
    if (Array.isArray(v)) out[k] = Array.isArray(t) && t.length === v.length ? t.map(String) : v;
    else out[k] = typeof t === "string" && t.trim() ? t : v;
  }
  return out;
}

export const QWEN_DEFAULT_MODEL = "qwen-plus";
/** Fallback model chosen from /models per endpoint+configured model (see qwenTranslator). */
const resolvedModels = new Map<string, string>();
export const QWEN_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** One JSON-mode chat turn: system + user prompt in, the model's raw text out. Shared by translation and summarisation. */
export type ChatJson = ((system: string, user: string) => Promise<string>) & { model?: string };
type ChatOpts = { /** Prefix for refusal errors, e.g. "翻译" → "翻译被模型拒绝". */ task?: string };

/**
 * Qwen (通义千问) through DashScope's OpenAI-compatible chat endpoint.
 * `QWEN_API_KEY` required; `QWEN_MODEL` (default qwen-plus) and `QWEN_BASE_URL` (use the -intl host outside China) optional.
 */
const MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoffMs = (attempt: number) => (process.env.NODE_ENV === "test" ? 0 : 1000 * 2 ** (attempt - 1));

export function qwenChat(opts: { apiKey: string; model?: string; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number } & ChatOpts = { apiKey: "" }): ChatJson {
  const baseUrl = (opts.baseUrl || QWEN_DEFAULT_BASE_URL).replace(/\/$/, "");
  const doFetch = opts.fetch ?? fetch;
  const headers = { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` };
  const configured = opts.model || QWEN_DEFAULT_MODEL;
  let model = resolvedModels.get(`${baseUrl}|${configured}`) ?? configured;
  let resolving: Promise<string | null> | null = null;

  /**
   * Some Alibaba endpoints (e.g. token-plan MaaS) expose versioned ids like `qwen3.8-flash` instead of `qwen-plus`.
   * When the configured model is unknown there, pick the best available chat model from /models once.
   */
  async function resolveModel(): Promise<string | null> {
    const res = await doFetch(`${baseUrl}/models`, { headers });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { data?: { id: string }[] };
    const ids = (body.data ?? []).map((m) => m.id).filter((id) => /qwen/i.test(id) && !/audio|image|tts|asr|realtime|vl|omni|embedding|rerank|coder|math/i.test(id));
    const pick = (re: RegExp) => ids.filter((id) => re.test(id)).sort().reverse()[0];
    return pick(/plus/) ?? pick(/max/) ?? pick(/flash|turbo/) ?? ids.sort().reverse()[0] ?? null;
  }

  const chat: ChatJson = async (system, user) => {
    const once = () =>
      doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
      });
    // The endpoint intermittently drops connections or times out: retry network errors, 429 and 5xx with backoff.
    const call = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          const res = await once();
          if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
            await sleep(backoffMs(attempt));
            continue;
          }
          return res;
        } catch (e) {
          if (attempt >= MAX_ATTEMPTS) {
            // undici reports "fetch failed" and hides the reason in `cause` (ETIMEDOUT, ECONNRESET, …).
            const cause = (e as { cause?: { code?: string; message?: string } }).cause;
            throw new Error(`Qwen 网络错误（重试 ${MAX_ATTEMPTS} 次）：${e instanceof Error ? e.message : e}${cause ? ` / ${cause.code ?? cause.message}` : ""}`, { cause: e });
          }
          await sleep(backoffMs(attempt));
        }
      }
    };
    let res = await call();
    if (res.status === 404 && model === configured) {
      // Concurrent workers share one lookup; the result is remembered for the process.
      resolving ??= resolveModel();
      const alt = await resolving;
      if (alt && alt !== configured) {
        // Every worker that saw the 404 retries with the shared answer (another worker may already have switched `model`).
        if (!resolvedModels.has(`${baseUrl}|${configured}`)) console.warn(`[qwen] model "${configured}" not found at ${new URL(baseUrl).host}; using "${alt}"`);
        resolvedModels.set(`${baseUrl}|${configured}`, alt);
        model = alt;
        chat.model = alt;
        res = await call();
      }
    }
    if (!res.ok) throw new Error(`Qwen 接口错误 ${res.status}：${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const choice = body.choices?.[0];
    if (!choice?.message?.content) throw new Error("Qwen 未返回内容");
    if (choice.finish_reason === "content_filter") throw new Error(`${opts.task ?? ""}被模型拒绝（内容过滤）`);
    return choice.message.content;
  };
  chat.model = model;
  return chat;
}

export const CLAUDE_MODEL = "claude-opus-5-5";

/** Claude through the Anthropic SDK (ANTHROPIC_API_KEY or an \`ant auth login\` profile). */
export function claudeChat(client = new Anthropic(), opts: ChatOpts = {}): ChatJson {
  const chat: ChatJson = async (system, user) => {
    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") throw new Error(`${opts.task ?? ""}被模型拒绝：${res.stop_details?.explanation ?? ""}`);
    return res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  };
  chat.model = CLAUDE_MODEL;
  return chat;
}

/** Parse a model's JSON answer (tolerates a ```json fence). */
export function parseJsonAnswer(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

/** Field translator on top of a chat model; `model` mirrors the chat's (possibly auto-resolved) model. */
function translatorFrom(chat: ChatJson): Translator {
  const t = (async (fields, ctx) => mergeAnswer(fields, await chat(SYSTEM, userPrompt(fields, ctx)))) as Translator;
  Object.defineProperty(t, "model", { get: () => chat.model, enumerable: true });
  return t;
}

export function qwenTranslator(opts: { apiKey: string; model?: string; baseUrl?: string; fetch?: typeof fetch } = { apiKey: "" }): Translator {
  return translatorFrom(qwenChat({ ...opts, task: "翻译" }));
}

export function claudeTranslator(client = new Anthropic()): Translator {
  return translatorFrom(claudeChat(client, { task: "翻译" }));
}

/** Which provider the environment selects: `TRANSLATE_PROVIDER` wins, else the first configured key (Qwen, then Claude). */
export function translationProvider(): "qwen" | "claude" | null {
  const forced = (process.env.TRANSLATE_PROVIDER ?? "").toLowerCase();
  const hasQwen = Boolean(process.env.QWEN_API_KEY);
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
  if (forced === "qwen") return hasQwen ? "qwen" : null;
  if (forced === "claude") return hasClaude ? "claude" : null;
  return hasQwen ? "qwen" : hasClaude ? "claude" : null;
}

export function hasTranslationCredentials() {
  return translationProvider() !== null;
}

/** Human-readable description of the active model, for UI hints. */
export function translationModelLabel(): string | null {
  const p = translationProvider();
  if (p === "qwen") return `通义千问 ${process.env.QWEN_MODEL || `${QWEN_DEFAULT_MODEL}（不可用时自动从 /models 选择）`}`;
  if (p === "claude") return `Claude ${CLAUDE_MODEL}`;
  return null;
}

export const NO_KEY_HINT = "未配置翻译模型 API key（QWEN_API_KEY 或 ANTHROPIC_API_KEY）";

/** The configured chat model (same provider choice as translation), else null. */
export function defaultChat(task?: string): ChatJson | null {
  const p = translationProvider();
  if (p === "qwen") return qwenChat({ apiKey: process.env.QWEN_API_KEY!, model: process.env.QWEN_MODEL, baseUrl: process.env.QWEN_BASE_URL, task });
  if (p === "claude") return claudeChat(undefined, { task });
  return null;
}

/** The model-backed translator when credentials exist, else null (dictionary-only mode). */
export function defaultTranslator(): Translator | null {
  const p = translationProvider();
  if (p === "qwen") return qwenTranslator({ apiKey: process.env.QWEN_API_KEY!, model: process.env.QWEN_MODEL, baseUrl: process.env.QWEN_BASE_URL });
  if (p === "claude") return claudeTranslator();
  return null;
}
