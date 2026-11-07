import { createHash } from "node:crypto";
import { and, db, eq, inArray, platforms, recordTranslations, records } from "@bb/db";
import { dictionaryPass, sourceHash, splitModelOutput, translatableFields, type Fields } from "./core";
import { learnEntries, loadDictionary, recordMissing } from "./dictionary";
import { defaultTranslator, type Translator } from "./llm";

const CONCURRENCY = 4;
/** Key inside a cached translation holding per-field source hashes (not a field). */
const SRC_KEY = "__src";
const fieldHash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

export type TranslateOptions = {
  lang?: string;
  /** Model translator; `undefined` = pick by credentials, `null` = dictionary only. */
  llm?: Translator | null;
  /** Re-translate even when the cache is current and complete. */
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
};

export type TranslateSummary = { total: number; translated: number; pending: number; skipped: number; /** First model error, when some records fell back to dictionary-only. */ error?: string };

/**
 * Translate records into `record_translations`: dictionary fields first, then the model for prose and for
 * dictionary gaps (which are learned back into the dictionary). Without model credentials the prose is left
 * untranslated and the row is marked `pending`, so a later run (after the key or dictionary is filled) completes it.
 * Cached rows are reused unless the source changed, they are pending, or `force` is set.
 */
export async function translateRecords(recordIds: string[], opts: TranslateOptions = {}): Promise<TranslateSummary> {
  const lang = opts.lang ?? "zh";
  const llm = opts.llm === undefined ? defaultTranslator() : opts.llm;
  const summary: TranslateSummary = { total: recordIds.length, translated: 0, pending: 0, skipped: 0 };
  if (!recordIds.length) return summary;
  const d = db();
  const rows = await d
    .select({ id: records.id, data: records.data, platformId: records.platformId, platformName: platforms.name, schema: platforms.fieldSchema })
    .from(records)
    .innerJoin(platforms, eq(platforms.id, records.platformId))
    .where(inArray(records.id, recordIds));
  const cached = await d.select().from(recordTranslations).where(and(inArray(recordTranslations.recordId, recordIds), eq(recordTranslations.lang, lang)));
  const byRecord = new Map(cached.map((c) => [c.recordId, c]));
  const dict = await loadDictionary(lang);

  const queue = [...rows];
  let done = 0;
  let firstError: Error | null = null;
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const fields = translatableFields(r.data, r.schema);
      const hash = sourceHash(fields);
      const hit = byRecord.get(r.id);
      if (hit && hit.sourceHash === hash && !hit.pending && !opts.force) {
        summary.skipped++;
      } else {
        const pass = dictionaryPass(fields, r.schema, dict);
        let data: Fields = { ...pass.translated };
        let pending = false;
        let model: string | null = hit?.model ?? null;
        // Keep the cached model translation of every prose field whose source text is unchanged (the whole record
        // is re-run whenever any field changes, e.g. a report parsed after the capture): pay only for what changed.
        const prevSrc = (hit?.data[SRC_KEY] ?? {}) as Record<string, string>;
        const src: Record<string, string> = {};
        for (const k of Object.keys(pass.forModel)) {
          if (k.startsWith("__dict:")) continue;
          src[k] = fieldHash(pass.forModel[k]);
          const prev = hit?.data[k];
          const same = hit && (hit.sourceHash === hash || prevSrc[k] === src[k]);
          if (same && (typeof prev === "string" || Array.isArray(prev))) {
            data[k] = prev as Fields[string];
            delete pass.forModel[k];
          }
        }
        if (Object.keys(pass.forModel).length) {
          if (llm) {
            try {
              const labels = Object.fromEntries(r.schema.map((f) => [f.key, f.label]));
              const out = await llm(pass.forModel, { platformName: r.platformName, labels });
              const { fields: tf, learned } = splitModelOutput(pass.forModel, out);
              data = { ...data, ...tf };
              model = llm.model ?? "llm";
              if (learned.length) await learnEntries(learned, lang);
              if (Object.keys(pass.forModel).some((k) => k.startsWith("__dict:"))) {
                // Rebuild the dictionary fields that were blocked on the learned words. A part the model skipped
                // keeps its field untranslated: mark the row pending so a later run asks again.
                const lookup = learned.length ? await loadDictionary(lang) : dict;
                const again = dictionaryPass(fields, r.schema, lookup);
                data = { ...data, ...again.translated, ...tf };
                pending = Object.keys(again.forModel).some((k) => k.startsWith("__dict:"));
              }
            } catch (e) {
              // Keep the dictionary part, mark pending so a later run (fixed key / model) completes it.
              pending = true;
              const err = e instanceof Error ? e : new Error(String(e));
              firstError ??= err;
              console.error(`[translate ${r.id}] model failed, saved dictionary-only:`, err.message);
            }
          } else {
            pending = true;
          }
        }
        await recordMissing(pass.missing, lang);
        // The record may have changed while the model was answering (a report parsed after the capture adds fields
        // and starts its own run). Writing now would replace that newer run's result with a stale one.
        const [now] = await d.select({ data: records.data }).from(records).where(eq(records.id, r.id));
        if (now && sourceHash(translatableFields(now.data, r.schema)) !== hash) {
          summary.skipped++;
          opts.onProgress?.(++done, rows.length);
          continue;
        }
        // Remember which source each prose translation belongs to (only the ones actually translated).
        const kept = Object.fromEntries(Object.entries(src).filter(([k]) => data[k] !== undefined));
        if (Object.keys(kept).length) (data as Record<string, unknown>)[SRC_KEY] = kept;
        await d
          .insert(recordTranslations)
          .values({ recordId: r.id, lang, sourceHash: hash, data, model, pending })
          .onConflictDoUpdate({ target: [recordTranslations.recordId, recordTranslations.lang], set: { sourceHash: hash, data, model, pending, createdAt: new Date() } });
        summary.translated++;
        if (pending) summary.pending++;
      }
      opts.onProgress?.(++done, rows.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  if (firstError) summary.error = (firstError as Error).message;
  return summary;
}

const soon = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Capture-time trigger: the result and its reports (GTS, medical, questionnaire) arrive within seconds of each
 * other and each changes the record, so translate once a few seconds after the last change instead of per change.
 */
export function translateRecordSoon(recordId: string, delayMs = 8000) {
  clearTimeout(soon.get(recordId));
  soon.set(
    recordId,
    setTimeout(() => {
      soon.delete(recordId);
      void translateRecordQuietly(recordId);
    }, delayMs),
  );
}

/** Fire-and-forget variant for capture time: never throws, just logs. */
export async function translateRecordQuietly(recordId: string) {
  try {
    await translateRecords([recordId]);
  } catch (e) {
    console.error(`[translate ${recordId}] failed:`, e);
  }
}

/** Translations for a set of records as `{ recordId → translated fields }`. */
export async function loadTranslations(recordIds: string[], lang = "zh"): Promise<Map<string, { data: Record<string, unknown>; pending: boolean }>> {
  if (!recordIds.length) return new Map();
  const rows = await db()
    .select({ recordId: recordTranslations.recordId, data: recordTranslations.data, pending: recordTranslations.pending })
    .from(recordTranslations)
    .where(and(inArray(recordTranslations.recordId, recordIds), eq(recordTranslations.lang, lang)));
  return new Map(rows.map((r) => [r.recordId, { data: r.data, pending: r.pending }]));
}
