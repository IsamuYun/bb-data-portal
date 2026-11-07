import { describe, expect, it } from "vitest";
import type { FieldSchema } from "@bb/db";
import { dictionaryPass, fieldMode, sourceHash, splitModelOutput, splitParts, translatableFields, type DictLookup } from "./core";
import { claudeTranslator, qwenTranslator } from "./llm";

const schema: FieldSchema = [
  { key: "donorNumber", label: "编号", type: "string", translate: "none" },
  { key: "title", label: "标题", type: "string", translate: "llm" },
  { key: "bloodType", label: "血型", type: "string", translate: "none" },
  { key: "bmi", label: "BMI", type: "number" },
  { key: "eyeColor", label: "眼睛颜色", type: "string" },
  { key: "ethnicOrigin", label: "族裔", type: "string" },
  { key: "ancestry", label: "祖源", type: "string[]" },
  { key: "about", label: "简介", type: "text" },
  { key: "childhoodPhotos", label: "童年照片", type: "url" },
];

const dict: Record<string, string | null> = { "\0Brown": "棕色", "\0Asian": "亚裔", "\0Caucasian": "白人", "ancestry\0English": "英格兰", "ancestry\0Nope": null };
const lookup: DictLookup = (f, s) => (dict[`${f}\0${s}`] !== undefined ? dict[`${f}\0${s}`] : dict[`\0${s}`]);

describe("fieldMode / translatableFields", () => {
  it("defaults by type and honours the explicit flag", () => {
    expect(schema.map(fieldMode)).toEqual(["none", "llm", "none", "none", "dict", "dict", "dict", "llm", "none"]);
  });
  it("keeps only fields that take part in translation", () => {
    const data = { donorNumber: "16432", title: "Life Coach", bloodType: "AB+", bmi: 27.6, eyeColor: "Brown", ancestry: ["English", "Irish"], about: "", childhoodPhotos: ["http://x"] };
    const f = translatableFields(data, schema);
    expect(f).toEqual({ title: "Life Coach", eyeColor: "Brown", ancestry: ["English", "Irish"] });
    expect(sourceHash(f)).toHaveLength(64);
  });
  it("splits comma lists but not thousands separators", () => {
    expect(splitParts("Asian, Caucasian, ")).toEqual(["Asian", "Caucasian"]);
    expect(splitParts("$2,397 per vial")).toEqual(["$2,397 per vial"]);
  });
});

describe("dictionaryPass", () => {
  it("translates known values, routes prose and unknown parts to the model, records gaps once", () => {
    const fields = { title: "Life Coach", eyeColor: "Brown", ethnicOrigin: "Asian, Caucasian", ancestry: ["English", "Irish", "Irish", "Nope"], about: "Hi" };
    const pass = dictionaryPass(fields, schema, lookup);
    expect(pass.translated).toEqual({ eyeColor: "棕色", ethnicOrigin: "亚裔、白人" });
    expect(pass.forModel).toEqual({ title: "Life Coach", about: "Hi", "__dict:ancestry:0": "Irish", "__dict:ancestry:1": "Nope" });
    expect(pass.missing).toEqual([{ fieldKey: "ancestry", source: "Irish" }]); // "Nope" is already a (blank) entry
  });
  it("learns dictionary words from the model output", () => {
    const req = { title: "Life Coach", "__dict:ancestry:0": "Irish" };
    const { fields, learned } = splitModelOutput(req, { title: "生活教练", "__dict:ancestry:0": "爱尔兰" });
    expect(fields).toEqual({ title: "生活教练" });
    expect(learned).toEqual([{ fieldKey: "ancestry", source: "Irish", target: "爱尔兰" }]);
  });
});

describe("qwenTranslator", () => {
  it("posts an OpenAI-style chat request and merges the JSON answer", async () => {
    const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"生活教练","__dict:ancestry:0":"爱尔兰"}' }, finish_reason: "stop" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const t = qwenTranslator({ apiKey: "k", fetch: fakeFetch });
    const out = await t({ title: "Life Coach", "__dict:ancestry:0": "Irish", about: "Hi" }, { platformName: "p", labels: { ancestry: "祖源" } });
    expect(out).toEqual({ title: "生活教练", "__dict:ancestry:0": "爱尔兰", about: "Hi" });
    expect(t.model).toBe("qwen-plus");
    expect(calls[0].url).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(calls[0].auth).toBe("Bearer k");
    expect(calls[0].body.model).toBe("qwen-plus");
    expect(String(calls[0].body.messages && (calls[0].body.messages as { content: string }[])[1].content)).toContain('"__dict:ancestry:0":"祖源"');
  });
  it("falls back to an available model when the configured one is unknown (404)", async () => {
    const models: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "qwen3.8-flash" }, { id: "qwen-audio-3.0-tts-plus" }, { id: "qwen3.7-plus" }, { id: "qwen3.8-max" }] }), { status: 200 });
      const m = String(JSON.parse(String(init?.body)).model);
      models.push(m);
      if (m === "qwen-plus") return new Response(JSON.stringify({ error: { code: "model_not_found" } }), { status: 404 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":"乙"}' }, finish_reason: "stop" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const t = qwenTranslator({ apiKey: "k", baseUrl: "https://example.test/v1", fetch: fakeFetch });
    // Two concurrent calls: both see the 404, share one /models lookup, both succeed.
    const [a, b] = await Promise.all([t({ a: "b" }, { platformName: "p", labels: {} }), t({ a: "c" }, { platformName: "p", labels: {} })]);
    expect(a).toEqual({ a: "乙" });
    expect(b).toEqual({ a: "乙" });
    expect(models.sort()).toEqual(["qwen-plus", "qwen-plus", "qwen3.7-plus", "qwen3.7-plus"]);
    expect(t.model).toBe("qwen3.7-plus");
    // A new translator for the same endpoint starts on the resolved model directly.
    models.length = 0;
    await qwenTranslator({ apiKey: "k", baseUrl: "https://example.test/v1", fetch: fakeFetch })({ a: "b" }, { platformName: "p", labels: {} });
    expect(models).toEqual(["qwen3.7-plus"]);
  });
  it("surfaces HTTP errors", async () => {
    const fakeFetch = (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch;
    await expect(qwenTranslator({ apiKey: "k", fetch: fakeFetch })({ a: "b" }, { platformName: "p", labels: {} })).rejects.toThrow("Qwen 接口错误 401");
  });
});

describe("claudeTranslator", () => {
  it("parses the model's JSON and falls back to the source when a key is missing or malformed", async () => {
    const fake = { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: '```json\n{"title":"生活教练","ancestry":["洪都拉斯人"],"extra":"x"}\n```' }] }) } };
    const t = claudeTranslator(fake as never);
    const out = await t({ title: "Life Coach", ancestry: ["Honduran", "Puerto Rican"], about: "Hi" }, { platformName: "p", labels: { title: "标题" } });
    expect(out).toEqual({ title: "生活教练", ancestry: ["Honduran", "Puerto Rican"], about: "Hi" });
  });
  it("throws on refusal", async () => {
    const fake = { messages: { create: async () => ({ stop_reason: "refusal", stop_details: { explanation: "no" }, content: [] }) } };
    await expect(claudeTranslator(fake as never)({ a: "b" }, { platformName: "p", labels: {} })).rejects.toThrow("翻译被模型拒绝");
  });
});
