import fs from "node:fs/promises";
import path from "node:path";
import { and, db, eq, exports, inArray, lt } from "@bb/db";
import { env } from "@/lib/env";
import { diskMediaLoader } from "./images";
import { buildPdf } from "./pdf";
import { loadExportInput } from "./query";
import { translateInput } from "./translate";
import type { ExportFilters } from "./types";
import { buildXlsx } from "./xlsx";

/** Exports still "running" after this long are assumed orphaned (process restarted mid-export). */
export const STALE_MS = 30 * 60 * 1000;

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");

/**
 * Generate the file for a pending export row. Claims the row first so a double trigger is a no-op,
 * then writes `<EXPORT_DIR>/<file>` and records the result. Errors land on the row, never thrown.
 */
export async function runExport(id: string): Promise<void> {
  const d = db();
  const [claimed] = await d.update(exports).set({ status: "running", error: null }).where(and(eq(exports.id, id), eq(exports.status, "pending"))).returning();
  if (!claimed || !claimed.platformId) return;
  try {
    const filters = (claimed.filters ?? {}) as ExportFilters;
    let input = await loadExportInput(claimed.platformId, filters);
    if (!input) throw new Error("平台不存在");
    // Dictionary fields always translate; prose needs a model key (QWEN_API_KEY / ANTHROPIC_API_KEY) and stays English (pending) without it.
    if (filters.translate) input = await translateInput(input);
    const buf = claimed.type === "xlsx" ? await buildXlsx(input, diskMediaLoader) : await buildPdf(input, diskMediaLoader);
    // File name deliberately carries no platform slug: exported files must not reveal the data source.
    const file = `export-${stamp(input.generatedAt)}-${id.slice(0, 8)}.${claimed.type}`;
    await fs.mkdir(env.EXPORT_DIR, { recursive: true });
    await fs.writeFile(path.join(env.EXPORT_DIR, file), buf);
    await d.update(exports).set({ status: "done", filePath: file, rowCount: input.records.length, finishedAt: new Date() }).where(eq(exports.id, id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[export ${id}] failed:`, e);
    await d.update(exports).set({ status: "failed", error: msg.slice(0, 2000), finishedAt: new Date() }).where(eq(exports.id, id));
  }
}

/** Mark exports that never finished (server restarted while generating) as failed so the UI stops polling. */
export async function failStaleExports() {
  await db()
    .update(exports)
    .set({ status: "failed", error: "生成过程中服务重启，请重新导出", finishedAt: new Date() })
    .where(and(inArray(exports.status, ["pending", "running"]), lt(exports.createdAt, new Date(Date.now() - STALE_MS))));
}

export async function removeExportFile(filePath: string | null) {
  if (!filePath) return;
  await fs.rm(path.join(env.EXPORT_DIR, path.basename(filePath)), { force: true });
}
