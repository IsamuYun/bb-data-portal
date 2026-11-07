import { db, desc, eq, jobRuns, records, sql } from "@bb/db";
import { translateRecordSoon } from "@/lib/translate/records";
import { pdfTextItems } from "./extract";
import { findGeneAwarePanel, parseGeneAware } from "./geneaware";

/** Media field the cryobank recipe uploads the GTS report PDF under. */
export const GTS_FIELD = "gtsReport";

export type GtsFields = {
  gtsPanel: string | null;
  gtsCarriers: unknown[] | null;
  /** English disease names in carrier order — a translatable field so profiles can show the Chinese name. */
  gtsCarrierDiseases: string[] | null;
};

/**
 * Parse a GTS report PDF into record fields. Only the "GeneAware Expanded Plus Panel" Results Summary is supported;
 * other panels keep their title in `gtsPanel` and get `gtsCarriers: null` (= not extracted, unlike [] = none found).
 */
export async function gtsFieldsFromPdf(bytes: Uint8Array): Promise<GtsFields> {
  const pages = await pdfTextItems(bytes);
  const summary = parseGeneAware(pages);
  if (summary) return { gtsPanel: summary.panel, gtsCarriers: summary.carriers, gtsCarrierDiseases: summary.carriers.map((c) => c.disease) };
  return { gtsPanel: findGeneAwarePanel(pages), gtsCarriers: null, gtsCarrierDiseases: null };
}

/**
 * Merge the parsed fields into the record (jsonb `||`, so the rest of `data` is untouched) and note the outcome in
 * the job's latest run log. Never throws: a broken PDF must not fail the media upload.
 */
export async function applyGtsReport(recordId: string, jobId: string | null, bytes: Uint8Array): Promise<GtsFields | null> {
  const d = db();
  let msg: { level: "info" | "warn"; msg: string };
  let fields: GtsFields | null = null;
  try {
    fields = await gtsFieldsFromPdf(bytes);
    await d
      .update(records)
      .set({ data: sql`${records.data} || ${JSON.stringify(fields)}::jsonb` })
      .where(eq(records.id, recordId));
    msg = fields.gtsCarriers
      ? { level: "info", msg: `GTS 报告解析：${fields.gtsPanel}，CARRIER ${fields.gtsCarriers.length} 条` }
      : { level: "warn", msg: `GTS 报告中没有 GeneAware Expanded Plus Panel 结果表（${fields.gtsPanel ?? "未识别的报告"}），未提取携带者` };
  } catch (e) {
    msg = { level: "warn", msg: `GTS 报告解析失败：${e instanceof Error ? e.message : String(e)}` };
  }
  // Disease names changed the translatable source: refresh the cached translation (dictionary/model) in the background.
  if (fields?.gtsCarrierDiseases?.length) translateRecordSoon(recordId);
  const [run] = jobId ? await d.select({ id: jobRuns.id }).from(jobRuns).where(eq(jobRuns.jobId, jobId)).orderBy(desc(jobRuns.startedAt)).limit(1) : [];
  if (run) {
    const entry = [{ t: 0, ...msg }];
    await d.update(jobRuns).set({ logs: sql`coalesce(${jobRuns.logs}, '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb` }).where(eq(jobRuns.id, run.id));
  }
  return fields;
}
