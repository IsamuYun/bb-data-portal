"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { db, eq, inArray, media, platforms, records, type RecordManual } from "@bb/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { env } from "../env";
import { requireUser } from "../require-user";

/** Delete the selected records; media rows cascade and their files are removed best-effort. */
export async function deleteRecordsAction(formData: FormData) {
  await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (ids.length === 0) throw new Error("请先选择记录");
  const d = db();
  const files = await d.select({ path: media.path }).from(media).where(inArray(media.recordId, ids));
  await d.delete(records).where(inArray(records.id, ids));
  await Promise.all(
    files.map(async (f) => {
      const abs = path.join(env.MEDIA_DIR, f.path);
      await fs.rm(abs, { force: true }).catch(() => {});
      await fs.rmdir(path.dirname(abs)).catch(() => {}); // only succeeds when the record folder is now empty
    }),
  );
  revalidatePath("/records");
  revalidatePath("/");
}

/** Re-parse the stored report PDFs with the current rules (cryobank: medical profile, questionnaire; Fairfax: genetic summary, photo set). No model. */
export async function reparseMedicalAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("缺少记录 id");
  const [rec] = await db().select({ slug: platforms.slug }).from(records).innerJoin(platforms, eq(platforms.id, records.platformId)).where(eq(records.id, id)).limit(1);
  if (!rec) throw new Error("记录不存在");
  const cryobank = rec.slug === "cryobank";
  const fairfax = rec.slug === "fairfax";
  const { reparseMedicalReport } = await import("../medical/apply");
  const { reparseDonorProfile } = await import("../donor-profile/apply");
  const { reparseFairfaxGenetic } = await import("../fairfax/genetic-apply");
  const { reparseFairfaxPhotoSet } = await import("../fairfax/photoset-apply");
  // The parsers are bank-specific: Fairfax's medical fields come from its web page (re-derived at boot), not a PDF.
  const [f, q, g, p] = await Promise.all([
    cryobank ? reparseMedicalReport(id) : null,
    cryobank ? reparseDonorProfile(id) : null,
    fairfax ? reparseFairfaxGenetic(id) : null,
    fairfax ? reparseFairfaxPhotoSet(id) : null,
  ]);
  if (!f && !q && !g && p === null) throw new Error("该记录没有可解析的报告 PDF（需用新版 Recipe 重新采集）");
  revalidatePath(`/records/${id}`);
  return { familyRows: f?.familyTable.length ?? 0, phrases: f?.medicalPhrases.length ?? 0, questionnaire: !!q, geneticTests: g?.geneticTests.length ?? null, portraits: p };
}

const manualCarriersInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }),
  z.object({ mode: z.literal("none"), panel: z.string().trim().max(200) }),
  z.object({
    mode: z.literal("carrier"),
    panel: z.string().trim().max(200),
    items: z
      .array(
        z.object({
          gene: z.string().trim().min(1, "每行都要填基因").max(60),
          disease: z.string().trim().min(1, "每行都要填疾病中文名").max(200),
          diseaseEn: z.string().trim().max(200).optional(),
          status: z.string().trim().max(40).optional(),
        }),
      )
      .min(1, "携带者阳性至少需要一行结果")
      .max(40),
  }),
]);
export type ManualCarriersInput = z.input<typeof manualCarriersInput>;

/**
 * Save (or clear, mode "auto") the hand-curated carrier screening of a record. Stored in `records.manual`, which
 * re-collection and report re-parsing never touch; the profile export prefers it over the parsed result.
 */
export async function saveManualCarriersAction(id: string, input: ManualCarriersInput): Promise<{ ok: true }> {
  await requireUser();
  const parsed = manualCarriersInput.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "输入有误");
  const v = parsed.data;
  const d = db();
  const [rec] = await d.select({ manual: records.manual }).from(records).where(eq(records.id, id)).limit(1);
  if (!rec) throw new Error("记录不存在");
  const next: RecordManual = { ...rec.manual };
  if (v.mode === "auto") delete next.carriers;
  else next.carriers = { kind: v.mode, panel: v.panel, items: v.mode === "carrier" ? v.items : [], updatedAt: new Date().toISOString() };
  await d.update(records).set({ manual: next }).where(eq(records.id, id));
  revalidatePath(`/records/${id}`);
  revalidatePath(`/records/${id}/edit`);
  revalidatePath("/records");
  return { ok: true };
}
