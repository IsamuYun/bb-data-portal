"use server";

import { and, count, datasets, db, eq, inArray, jobs, platforms } from "@bb/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "../require-user";
import { buildJobs, parseSpreadsheet } from "../import/parse";
import { readImportFile } from "../import/store";

const input = z.object({
  token: z.string().min(1),
  fileName: z.string().min(1),
  platformId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  mapping: z.object({
    urlColumn: z.string().min(1),
    externalIdColumn: z.string(),
    seedColumns: z.array(z.string()),
  }),
  /** Skip rows whose external id already has a job on this platform. */
  skipExisting: z.boolean().default(true),
});
export type CreateDatasetInput = z.input<typeof input>;
export type CreateDatasetResult =
  | { ok: true; datasetId: string; created: number; skippedRows: { row: number; reason: string }[]; skippedExisting: number }
  | { ok: false; error: string };

export async function createDatasetFromImport(raw: CreateDatasetInput): Promise<CreateDatasetResult> {
  const user = await requireUser();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "输入无效" };
  const { token, fileName, platformId, name, mapping, skipExisting } = parsed.data;
  try {
    const d = db();
    const [p] = await d.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, platformId)).limit(1);
    if (!p) return { ok: false, error: "平台不存在" };
    const sheet = parseSpreadsheet(await readImportFile(token), token);
    const { jobs: built, skipped } = buildJobs(sheet, mapping);
    if (built.length === 0) return { ok: false, error: "没有可导入的行" };

    let toInsert = built;
    let skippedExisting = 0;
    if (skipExisting) {
      const ids = built.map((j) => j.externalId);
      const existing = await d
        .select({ externalId: jobs.externalId })
        .from(jobs)
        .where(and(eq(jobs.platformId, platformId), inArray(jobs.externalId, ids)));
      const has = new Set(existing.map((e) => e.externalId));
      toInsert = built.filter((j) => !has.has(j.externalId));
      skippedExisting = built.length - toInsert.length;
    }
    if (toInsert.length === 0) {
      return { ok: false, error: `文件中的 ${built.length} 行在该平台都已有任务，没有新任务可生成；如需重采，请在任务页重试或取消“跳过已存在”选项` };
    }

    const datasetId = await d.transaction(async (tx) => {
      const [ds] = await tx.insert(datasets).values({ platformId, name, sourceFile: fileName, createdBy: user.id }).returning({ id: datasets.id });
      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500);
        await tx.insert(jobs).values(chunk.map((j) => ({ datasetId: ds.id, platformId, url: j.url, externalId: j.externalId, seed: j.seed })));
      }
      return ds.id;
    });
    revalidatePath("/datasets");
    revalidatePath("/jobs");
    revalidatePath("/");
    return { ok: true, datasetId, created: toInsert.length, skippedRows: skipped, skippedExisting };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "导入失败" };
  }
}

export async function deleteDatasetAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const d = db();
  const [{ running }] = await d
    .select({ running: count() })
    .from(jobs)
    .where(and(eq(jobs.datasetId, id), inArray(jobs.status, ["leased", "running"])));
  if (running > 0) throw new Error("仍有任务在执行，无法删除");
  await d.delete(datasets).where(eq(datasets.id, id));
  revalidatePath("/datasets");
  revalidatePath("/jobs");
  revalidatePath("/");
}
