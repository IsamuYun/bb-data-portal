import { NextResponse } from "next/server";
import { and, db, eq, media, ne, platforms, records, sql } from "@bb/db";
import { getSessionUser } from "@/lib/session";
import { applyReport, DOC_FIELDS, isPdf, MAX_MEDIA_BYTES, removeMediaFile, sha256, writeMediaFile } from "@/lib/media/store";

export const runtime = "nodejs";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Manual media edit from the record page. Multipart fields:
 * - `file` (required)
 * - `replaceId`: media id to replace in place (keeps its field and position), or
 * - `field`: media field to add the file to (a photo field of the platform schema or a report key).
 * A replaced/added report PDF is parsed into the record right away, like a captured one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return fail("未登录", 401);
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("缺少文件");
  if (file.size > MAX_MEDIA_BYTES) return fail("文件超过 50MB", 413);

  const d = db();
  const [rec] = await d
    .select({ id: records.id, externalId: records.externalId, jobId: records.jobId, slug: platforms.slug, schema: platforms.fieldSchema })
    .from(records)
    .innerJoin(platforms, eq(platforms.id, records.platformId))
    .where(eq(records.id, id))
    .limit(1);
  if (!rec) return fail("记录不存在", 404);

  const replaceId = String(form.get("replaceId") ?? "");
  const [old] = replaceId ? await d.select().from(media).where(and(eq(media.id, replaceId), eq(media.recordId, id))).limit(1) : [];
  if (replaceId && !old) return fail("要替换的文件不存在", 404);
  const field = old?.fieldKey ?? String(form.get("field") ?? "");
  const photoFields = new Set(rec.schema.filter((f) => f.type === "url").map((f) => f.key));
  const isDoc = field in DOC_FIELDS;
  // Existing groups may use keys outside the schema (e.g. childhoodPhotos); allow those when replacing.
  if (!old && !isDoc && !photoFields.has(field)) {
    const [known] = await d.select({ id: media.id }).from(media).where(and(eq(media.recordId, id), eq(media.fieldKey, field))).limit(1);
    if (!known) return fail(`未知的媒体字段：${field || "（空）"}`);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let mime = file.type || "application/octet-stream";
  if (isDoc) {
    if (!isPdf(mime, buf)) return fail("报告只能上传 PDF");
    mime = "application/pdf";
  } else if (!mime.startsWith("image/")) return fail("照片只能上传图片文件");
  const sha = sha256(buf);
  const [dup] = await d
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.recordId, id), eq(media.sha256, sha), old ? ne(media.id, old.id) : undefined))
    .limit(1);
  if (dup) return fail("该记录里已有相同的文件", 409);

  const kind = isDoc ? "doc" : "photo";
  let mediaId: string;
  if (old) {
    const rel = await writeMediaFile({ slug: rec.slug, externalId: rec.externalId, field, position: old.position, sha, mime, fileName: file.name, buf });
    // createdAt = now so "latest report" lookups (re-parse) pick the replacement.
    await d
      .update(media)
      .set({ path: rel, sha256: sha, mime, size: buf.length, kind, originalUrl: null, width: null, height: null, createdAt: new Date() })
      .where(eq(media.id, old.id));
    if (old.path !== rel) await removeMediaFile(old.path);
    mediaId = old.id;
  } else {
    const [{ next }] = await d
      .select({ next: sql<number>`coalesce(max(${media.position}) + 1, 0)::int` })
      .from(media)
      .where(and(eq(media.recordId, id), eq(media.fieldKey, field)));
    const rel = await writeMediaFile({ slug: rec.slug, externalId: rec.externalId, field, position: next, sha, mime, fileName: file.name, buf });
    const [m] = await d.insert(media).values({ recordId: id, kind, path: rel, sha256: sha, mime, size: buf.length, fieldKey: field, position: next }).returning({ id: media.id });
    mediaId = m.id;
  }
  if (isDoc) await applyReport({ slug: rec.slug, recordId: id, jobId: null, field, buf, mime });
  await d.update(records).set({ updatedAt: new Date() }).where(eq(records.id, id));
  return NextResponse.json({ ok: true, mediaId, parsed: isDoc && rec.slug === "cryobank" });
}

/** Delete one media file of the record: `DELETE ?mediaId=…`. Fields already parsed from a deleted report are kept. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return fail("未登录", 401);
  const { id } = await params;
  const mediaId = new URL(req.url).searchParams.get("mediaId") ?? "";
  const [m] = await db()
    .delete(media)
    .where(and(eq(media.id, mediaId), eq(media.recordId, id)))
    .returning({ path: media.path });
  if (!m) return fail("文件不存在", 404);
  await removeMediaFile(m.path);
  return NextResponse.json({ ok: true });
}
