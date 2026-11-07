import fs from "node:fs/promises";
import path from "node:path";
import { and, db, desc, eq, jobRuns, media, records, sql } from "@bb/db";
import { readFormPages } from "@/lib/donor-profile/form";
import { env } from "@/lib/env";
import { familyDiagnosisNames, medicalLeftovers } from "@/lib/profile/zh";
import { translateRecordSoon } from "@/lib/translate/records";
import { parseMedicalPages } from "./parse";
import { parseMedicalHeader, pdfText } from "./profile";

/** Media field the cryobank recipe uploads the Medical Profile PDF under. */
export const MEDICAL_FIELD = "medicalReport";
/** Model-written summaries of earlier versions, replaced by the parsed fields below. */
const RETIRED_KEYS = ["personalHealth", "familyHistory", "riskAssessment"];

export async function appendRunLog(jobId: string | null, entry: { level: "info" | "warn"; msg: string }) {
  if (!jobId) return;
  const d = db();
  const [run] = await d.select({ id: jobRuns.id }).from(jobRuns).where(eq(jobRuns.jobId, jobId)).orderBy(desc(jobRuns.startedAt)).limit(1);
  if (run) await d.update(jobRuns).set({ logs: sql`coalesce(${jobRuns.logs}, '[]'::jsonb) || ${JSON.stringify([{ t: 0, ...entry }])}::jsonb` }).where(eq(jobRuns.id, run.id));
}

/**
 * Everything the profile needs from the Medical Profile, by parsing only (no model): header dates, personal health
 * answers, the family history table, risk topics, plus the diagnosis names and the clauses no wording rule covers,
 * which the dictionary translates (`familyDiagnoses`, `medicalPhrases`).
 */
export async function medicalFieldsFromPdf(bytes: Uint8Array) {
  const header = parseMedicalHeader(await pdfText(bytes));
  const parsed = parseMedicalPages(await readFormPages(bytes));
  return {
    ...header,
    ...parsed,
    familyDiagnoses: familyDiagnosisNames(parsed.familyTable),
    medicalPhrases: medicalLeftovers(parsed.healthRecord, parsed.familyTable),
  };
}
export type MedicalFields = Awaited<ReturnType<typeof medicalFieldsFromPdf>>;

/** Merge a record-data patch, dropping the given keys; then schedule the (dictionary-first) translation. */
export async function mergeRecordData(recordId: string, patch: Record<string, unknown>, drop: string[] = []) {
  await db()
    .update(records)
    .set({ data: sql`(${records.data} - ${sql.raw(`array[${drop.map((k) => `'${k.replace(/'/g, "")}'`).join(",") || "''"}]::text[]`)}) || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(records.id, recordId));
  translateRecordSoon(recordId);
}

/** Parse the Medical Profile into the record. Never throws (failures go to the job log). */
export async function applyMedicalReport(recordId: string, jobId: string | null, bytes: Uint8Array): Promise<MedicalFields | null> {
  try {
    const fields = await medicalFieldsFromPdf(bytes);
    await mergeRecordData(recordId, fields, RETIRED_KEYS);
    await appendRunLog(jobId, {
      level: fields.familyTable.length ? "info" : "warn",
      msg: `病史报告解析：家族史 ${fields.familyTable.length} 行，风险提示 ${fields.riskTopics.length} 项，待词典翻译短句 ${fields.medicalPhrases.length} 条`,
    });
    return fields;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[medical ${recordId}]`, e);
    await appendRunLog(jobId, { level: "warn", msg: `病史报告解析失败：${msg}` }).catch(() => {});
    return null;
  }
}

export async function latestMedia(recordId: string, field: string) {
  const [m] = await db()
    .select({ path: media.path })
    .from(media)
    .where(and(eq(media.recordId, recordId), eq(media.fieldKey, field)))
    .orderBy(desc(media.createdAt))
    .limit(1);
  return m ? new Uint8Array(await fs.readFile(path.join(env.MEDIA_DIR, m.path))) : null;
}

/** Re-run the parse from the stored PDF (after parser changes). */
export async function reparseMedicalReport(recordId: string): Promise<MedicalFields | null> {
  const bytes = await latestMedia(recordId, MEDICAL_FIELD);
  if (!bytes) return null;
  const fields = await applyMedicalReport(recordId, null, bytes);
  if (!fields) throw new Error("病史报告解析失败，详见服务器日志");
  return fields;
}
