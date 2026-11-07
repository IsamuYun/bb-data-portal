import { loadTranslations, translateRecords } from "@/lib/translate/records";
import type { Translator } from "@/lib/translate/llm";
import type { ExportInput, ExportRecord } from "./types";

/**
 * Return the export input with each record's data overlaid by its Chinese translation
 * (dictionary for fixed vocabularies, model for prose; see lib/translate). Records whose
 * translation is cached and current are not re-translated.
 */
export async function translateInput(input: ExportInput, opts: { llm?: Translator | null; onProgress?: (done: number, total: number) => void } = {}): Promise<ExportInput> {
  const ids = input.records.map((r) => r.id);
  await translateRecords(ids, { llm: opts.llm, onProgress: opts.onProgress });
  const map = await loadTranslations(ids);
  const records: ExportRecord[] = input.records.map((r) => ({ ...r, data: { ...r.data, ...(map.get(r.id)?.data ?? {}) } }));
  return { ...input, records };
}
