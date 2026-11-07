"use server";

import { db, eq, exports, platforms } from "@bb/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "../require-user";
import { removeExportFile, runExport } from "../export/run";
import type { ExportFilters } from "../export/types";

export type ExportActionState = { error?: string; ok?: boolean } | undefined;

/** Queue an export; the file is generated after the response is sent and the list polls until done. */
export async function createExportAction(_prev: ExportActionState, formData: FormData): Promise<ExportActionState> {
  const user = await requireUser();
  const platformId = String(formData.get("platformId") ?? "");
  const type = String(formData.get("type") ?? "");
  if (type !== "xlsx" && type !== "pdf") return { error: "请选择导出格式" };
  const filters: ExportFilters = {};
  const q = String(formData.get("q") ?? "").trim();
  if (q) filters.q = q.slice(0, 200);
  if (formData.get("withMediaOnly") === "on") filters.withMediaOnly = true;
  // "zh" translates (dictionary + model); "en" exports the captured original text untouched.
  if (String(formData.get("lang") ?? "zh") !== "en") filters.translate = true;
  const d = db();
  const [p] = await d.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, platformId)).limit(1);
  if (!p) return { error: "平台不存在" };
  const [row] = await d.insert(exports).values({ type, platformId, filters, createdBy: user.id }).returning({ id: exports.id });
  after(() => runExport(row.id));
  revalidatePath("/exports");
  return { ok: true };
}

export async function deleteExportAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const [row] = await db().delete(exports).where(eq(exports.id, id)).returning({ filePath: exports.filePath });
  if (row) await removeExportFile(row.filePath);
  revalidatePath("/exports");
}

/** Re-run a failed export with the same parameters. */
export async function retryExportAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const [row] = await db().update(exports).set({ status: "pending", error: null, filePath: null, rowCount: null, finishedAt: null }).where(eq(exports.id, id)).returning({ id: exports.id });
  if (row) after(() => runExport(row.id));
  revalidatePath("/exports");
}
