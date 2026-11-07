import { appendRunLog, latestMedia, mergeRecordData } from "@/lib/medical/apply";
import { annotateForm, readFormPages } from "./form";
import { parseQuestionnaire, type Questionnaire } from "./questionnaire";

/** Media field the cryobank recipe uploads the Extended donor profile (`<no>LP.pdf`) under. */
export const PROFILE_FIELD = "profileReport";
/** Model-written fields of an earlier version, replaced by the parsed questionnaire. */
const RETIRED_KEYS = ["degreeSummary", "school", "gpa", "skills", "highlights"];

/** The social questionnaire pages ("Social Page n of 5") of the LP file, parsed; the medical copies are skipped. */
export async function questionnaireFromPdf(bytes: Uint8Array): Promise<Questionnaire> {
  const pages = annotateForm(await readFormPages(bytes));
  const social = pages.filter((p) => /Social Page \d+ of \d+/i.test(p));
  return parseQuestionnaire(social.length ? social : pages.slice(0, 5));
}

/** Parse the questionnaire into the record (no model). Never throws. */
export async function applyDonorProfile(recordId: string, jobId: string | null, bytes: Uint8Array): Promise<Questionnaire | null> {
  try {
    const q = await questionnaireFromPdf(bytes);
    await mergeRecordData(recordId, q, RETIRED_KEYS);
    const filled = Object.values(q).filter((v) => (Array.isArray(v) ? v.length : v)).length;
    await appendRunLog(jobId, { level: filled ? "info" : "warn", msg: `详细资料问卷解析：${filled} 项有内容` });
    return q;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[donor-profile ${recordId}]`, e);
    await appendRunLog(jobId, { level: "warn", msg: `详细资料问卷解析失败：${msg}` }).catch(() => {});
    return null;
  }
}

export async function reparseDonorProfile(recordId: string): Promise<Questionnaire | null> {
  const bytes = await latestMedia(recordId, PROFILE_FIELD);
  return bytes ? applyDonorProfile(recordId, null, bytes) : null;
}
