import { db, dictionaryEntries, eq, sql } from "@bb/db";
import type { DictLookup } from "./core";

const key = (fieldKey: string, source: string) => `${fieldKey}\u0000${source.trim()}`;

/** Load one language's dictionary into memory; field-scoped entries win over global ones. */
export async function loadDictionary(lang = "zh"): Promise<DictLookup> {
  const rows = await db().select({ fieldKey: dictionaryEntries.fieldKey, source: dictionaryEntries.source, target: dictionaryEntries.target }).from(dictionaryEntries).where(eq(dictionaryEntries.lang, lang));
  const map = new Map<string, string | null>();
  for (const r of rows) map.set(key(r.fieldKey, r.source), r.target);
  return (fieldKey, source) => {
    const scoped = map.get(key(fieldKey, source));
    if (scoped !== undefined) return scoped;
    return map.get(key("", source));
  };
}

/** Record dictionary gaps as untranslated entries (so the admin can fill them); existing rows untouched. */
export async function recordMissing(entries: { fieldKey: string; source: string }[], lang = "zh") {
  if (!entries.length) return;
  await db()
    .insert(dictionaryEntries)
    .values(entries.map((e) => ({ lang, fieldKey: e.fieldKey, source: e.source.trim(), target: null, origin: "scan" })))
    .onConflictDoNothing();
}

/** Store translations the model produced for dictionary words; never overwrites a human/seed translation. */
export async function learnEntries(entries: { fieldKey: string; source: string; target: string }[], lang = "zh") {
  if (!entries.length) return;
  await db()
    .insert(dictionaryEntries)
    .values(entries.map((e) => ({ lang, fieldKey: e.fieldKey, source: e.source.trim(), target: e.target, origin: "llm" })))
    .onConflictDoUpdate({
      target: [dictionaryEntries.lang, dictionaryEntries.fieldKey, dictionaryEntries.source],
      set: { target: sql`coalesce(${dictionaryEntries.target}, excluded.target)`, origin: sql`case when ${dictionaryEntries.target} is null then 'llm' else ${dictionaryEntries.origin} end`, updatedAt: new Date() },
    });
}
