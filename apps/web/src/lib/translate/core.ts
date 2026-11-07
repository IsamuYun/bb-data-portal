import { createHash } from "node:crypto";
import type { FieldSchema, TranslateMode } from "@bb/db";

export type Value = string | string[];
export type Fields = Record<string, Value>;

/** Lookup into the dictionary: `undefined` = never seen, `null` = seen but untranslated, string = translation. */
export type DictLookup = (fieldKey: string, source: string) => string | null | undefined;

/** Keys of parts the model is asked to translate on the dictionary's behalf: `__dict:<fieldKey>:<n>`. */
export const DICT_KEY = /^__dict:([^:]+):\d+$/;

/** Effective mode: explicit flag, else by type (prose → model, codes/urls → untouched, short values → dictionary). */
export function fieldMode(f: FieldSchema[number]): TranslateMode {
  if (f.type === "json") return "none";
  if (f.translate) return f.translate;
  if (f.type === "text") return "llm";
  if (f.type === "url" || f.type === "number") return "none";
  return "dict";
}

const NUMERIC_OR_CODE = /^[\s\d.,:/+\-%$€£¥#()'"xX×<>]*$/;

/** Dictionary values can be comma lists ("Asian, Caucasian"); parts are looked up one by one. */
export function splitParts(v: string): string[] {
  return v
    .split(/,\s+/)
    .map((p) => p.trim().replace(/,$/, ""))
    .filter(Boolean);
}

export function translatable(v: unknown): Value | null {
  if (typeof v === "string") return v.trim() && !NUMERIC_OR_CODE.test(v) ? v : null;
  if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return v as string[];
  return null;
}

/** Everything the translation depends on, keyed by field; hashed to detect re-captures. */
export function translatableFields(data: Record<string, unknown>, schema: FieldSchema): Fields {
  const out: Fields = {};
  for (const f of schema) {
    if (fieldMode(f) === "none") continue;
    const v = translatable(data[f.key]);
    if (v !== null) out[f.key] = v;
  }
  return out;
}

export function sourceHash(fields: Fields) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

export type DictPass = {
  /** Fields fully translated by the dictionary. */
  translated: Fields;
  /** What still needs the model: `llm` fields plus `__dict:` parts the dictionary lacks. */
  forModel: Fields;
  /** Dictionary gaps (field-scoped), to record as untranslated entries. */
  missing: { fieldKey: string; source: string }[];
};

/**
 * First pass: translate every `dict` field through the dictionary; collect the unknown parts for the model and
 * leave `llm` fields for it as well. Pure, so it is unit-tested without a database.
 */
export function dictionaryPass(fields: Fields, schema: FieldSchema, lookup: DictLookup): DictPass {
  const translated: Fields = {};
  const forModel: Fields = {};
  const missing: { fieldKey: string; source: string }[] = [];
  const seen = new Set<string>();
  let n = 0;
  for (const f of schema) {
    const v = fields[f.key];
    if (v === undefined) continue;
    const mode = fieldMode(f);
    if (mode === "llm") {
      forModel[f.key] = v;
      continue;
    }
    if (mode !== "dict") continue;
    const items = Array.isArray(v) ? v : [v];
    const out: string[] = [];
    let complete = true;
    for (const item of items) {
      const whole = lookup(f.key, item);
      if (typeof whole === "string") {
        out.push(whole);
        continue;
      }
      const parts = splitParts(item);
      const tparts: string[] = [];
      for (const part of parts) {
        const t = lookup(f.key, part);
        if (typeof t === "string") tparts.push(t);
        else {
          complete = false;
          const id = `${f.key}\u0000${part}`;
          if (!seen.has(id)) {
            seen.add(id);
            if (t === undefined) missing.push({ fieldKey: f.key, source: part });
            forModel[`__dict:${f.key}:${n++}`] = part;
          }
        }
      }
      out.push(tparts.join("、"));
    }
    if (complete) translated[f.key] = Array.isArray(v) ? out : out[0];
  }
  return { translated, forModel, missing };
}

/**
 * Split the model's answer: `__dict:` keys are dictionary learnings (source taken from the request),
 * everything else is a field translation.
 */
export function splitModelOutput(request: Fields, response: Fields): { fields: Fields; learned: { fieldKey: string; source: string; target: string }[] } {
  const fields: Fields = {};
  const learned: { fieldKey: string; source: string; target: string }[] = [];
  for (const [k, v] of Object.entries(response)) {
    const m = DICT_KEY.exec(k);
    if (!m) fields[k] = v;
    else if (typeof v === "string" && typeof request[k] === "string" && v.trim() && v !== request[k]) learned.push({ fieldKey: m[1], source: request[k], target: v.trim() });
  }
  return { fields, learned };
}
