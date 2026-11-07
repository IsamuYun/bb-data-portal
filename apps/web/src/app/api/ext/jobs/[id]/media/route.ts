import { and, db, eq, jobs, media, platforms, records } from "@bb/db";
import { mediaUploadFields, type MediaUploadResponse } from "@bb/shared";
import { authDevice, fail, isResponse, json } from "@/lib/ext/auth";
import { applyReport, MAX_MEDIA_BYTES, sha256, writeMediaFile } from "@/lib/media/store";

export const runtime = "nodejs";

/** Upload one media file for the record produced by a job. Deduped per record by sha256. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const dev = await authDevice(req);
  if (isResponse(dev)) return dev;
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("缺少 file");
  if (file.size > MAX_MEDIA_BYTES) return fail("文件超过 50MB", 413);
  const meta = mediaUploadFields.safeParse({
    field: form.get("field"),
    kind: form.get("kind") ?? "photo",
    position: form.get("position") ?? 0,
    originalUrl: form.get("originalUrl") ?? undefined,
  });
  if (!meta.success) return fail(meta.error.issues[0]?.message ?? "字段无效");

  const d = db();
  const [row] = await d
    .select({ recordId: records.id, slug: platforms.slug, externalId: records.externalId })
    .from(jobs)
    .innerJoin(records, eq(records.jobId, jobs.id))
    .innerJoin(platforms, eq(platforms.id, jobs.platformId))
    .where(eq(jobs.id, id))
    .limit(1);
  if (!row) return fail("该任务还没有入库记录，请先上报结果", 409);

  const buf = Buffer.from(await file.arrayBuffer());
  const sha = sha256(buf);
  const mime = file.type || "application/octet-stream";
  // A re-capture replaces records.data before the (usually identical, hence deduped) report is uploaded again,
  // so the report is parsed on every upload, not only when the file is new.
  // Reports are parsed by rules (no model), in well under a second, so before responding.
  const parseReports = () => applyReport({ slug: row.slug, recordId: row.recordId, jobId: id, field: meta.data.field, buf, mime });
  const [dup] = await d.select({ id: media.id }).from(media).where(and(eq(media.recordId, row.recordId), eq(media.sha256, sha))).limit(1);
  if (dup) {
    await parseReports();
    return json({ ok: true, mediaId: dup.id, deduped: true } satisfies MediaUploadResponse);
  }

  const rel = await writeMediaFile({ slug: row.slug, externalId: row.externalId, field: meta.data.field, position: meta.data.position, sha, mime, fileName: file.name, buf });
  const [m] = await d
    .insert(media)
    .values({ recordId: row.recordId, kind: meta.data.kind, path: rel, sha256: sha, mime, size: buf.length, originalUrl: meta.data.originalUrl, fieldKey: meta.data.field, position: meta.data.position })
    .returning({ id: media.id });
  await parseReports();
  return json({ ok: true, mediaId: m.id, deduped: false } satisfies MediaUploadResponse);
}
