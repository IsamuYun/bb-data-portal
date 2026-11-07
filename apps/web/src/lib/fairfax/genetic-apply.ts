import { and, db, desc, eq, media, sql } from "@bb/db";
import { readMediaFile } from "@/lib/media/store";
import { appendRunLog, mergeRecordData } from "@/lib/medical/apply";
import { type FairfaxGenetic, fairfaxGeneticFromPdf } from "./genetic";

/** Media field the Fairfax recipe uploads the Genetic Testing PDF under. */
export const GENETIC_FIELD = "geneticReport";

/** Parse the Genetic Testing summary into the record. Never throws (failures go to the job log). */
export async function applyFairfaxGenetic(recordId: string, jobId: string | null, bytes: Uint8Array): Promise<FairfaxGenetic | null> {
  try {
    const g = await fairfaxGeneticFromPdf(bytes);
    // An unreadable summary must not wipe fields a page capture set (Jewish ancestry) or an earlier parse found.
    const patch = Object.fromEntries(Object.entries(g).filter(([k, v]) => v !== null || k === "gtsCarriers" || k === "gtsCarrierDiseases"));
    await mergeRecordData(recordId, patch);
    await appendRunLog(jobId, {
      level: g.geneticTests.length && g.gtsCarriers ? "info" : "warn",
      msg: g.geneticTests.length
        ? `基因检测解析：${g.geneticTests.length} 项，${g.gtsPanel ?? "未识别套餐"}，${g.gtsCarriers ? "未检出携带者" : "结果需人工查看"}`
        : "基因检测 PDF 第 1 页没有 Genetic Testing Summary 表格，未提取",
    });
    return g;
  } catch (e) {
    console.error(`[fairfax genetic ${recordId}]`, e);
    await appendRunLog(jobId, { level: "warn", msg: `基因检测 PDF 解析失败：${e instanceof Error ? e.message : String(e)}` }).catch(() => {});
    return null;
  }
}

/**
 * The stored Genetic Testing PDF. Media are deduplicated per record by content, and the Medical Profile page often
 * links the very same file, so it can sit under `medicalReport` instead: any PDF of the record whose first page is the
 * summary table qualifies (the genetic field first, newest first).
 */
async function storedGeneticPdf(recordId: string): Promise<{ bytes: Uint8Array; parsed: FairfaxGenetic } | null> {
  const pdfs = await db()
    .select({ path: media.path })
    .from(media)
    .where(and(eq(media.recordId, recordId), eq(media.mime, "application/pdf")))
    .orderBy(sql`${media.fieldKey} = ${GENETIC_FIELD} desc`, desc(media.createdAt));
  for (const m of pdfs) {
    const buf = await readMediaFile(m.path);
    if (!buf) continue;
    const parsed = await fairfaxGeneticFromPdf(new Uint8Array(buf)).catch(() => null);
    if (parsed?.geneticTests.length) return { bytes: new Uint8Array(buf), parsed };
  }
  return null;
}

/** Re-run the parse from the stored PDF (after parser changes); null when the record has none. */
export async function reparseFairfaxGenetic(recordId: string): Promise<FairfaxGenetic | null> {
  const found = await storedGeneticPdf(recordId);
  if (!found) return null;
  const g = await applyFairfaxGenetic(recordId, null, found.bytes);
  if (!g) throw new Error("基因检测 PDF 解析失败，详见服务器日志");
  return g;
}
