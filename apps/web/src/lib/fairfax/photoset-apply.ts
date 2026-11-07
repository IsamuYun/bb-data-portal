import sharp from "sharp";
import { and, db, desc, eq, inArray, like, media, records } from "@bb/db";
import { appendRunLog } from "@/lib/medical/apply";
import { readMediaFile, removeMediaFile, sha256, writeMediaFile } from "@/lib/media/store";
import { portraitsFromPhotoSet } from "./photoset";

/** Media field the recipe uploads the photo-set PDF under; the PDF itself is moved to PHOTO_SET_PDF. */
export const PHOTO_SET_FIELD = "adulthoodPhotos";
export const PHOTO_SET_PDF = "photoSetPdf";
/** The site's own small childhood thumbnail, set aside when the photo set holds the same picture in high resolution. */
export const CHILDHOOD_THUMB = "childhoodThumb";
const DERIVED = "photoset:";

/** 64-bit difference hash as a bit string: near-identical pictures (other size / compression) differ in few bits. */
async function dhash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let h = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h += px[y * 9 + x] > px[y * 9 + x + 1] ? "1" : "0";
  return h;
}
const hamming = (a: string, b: string) => [...a].reduce((n, c, i) => n + (c === b[i] ? 0 : 1), 0);

/**
 * Photo-set PDF → portraits: the first (topmost) is the childhood photo, the others adult photos (true for every
 * layout seen: 2 and 4 photos). Re-running replaces the previous crops, so a re-capture or a better cropper just
 * redoes it.
 */
export async function applyFairfaxPhotoSet(recordId: string, jobId: string | null, pdf: Buffer, read: (rel: string) => Promise<Buffer | null>): Promise<number | null> {
  const d = db();
  const [rec] = await d.select({ externalId: records.externalId }).from(records).where(eq(records.id, recordId)).limit(1);
  if (!rec) return null;
  const sha = sha256(pdf);
  // The PDF is a document now, not one of the photos.
  await d.update(media).set({ fieldKey: PHOTO_SET_PDF, kind: "doc" }).where(and(eq(media.recordId, recordId), eq(media.sha256, sha)));

  let portraits;
  try {
    portraits = await portraitsFromPhotoSet(new Uint8Array(pdf));
  } catch (e) {
    await appendRunLog(jobId, { level: "warn", msg: `照片集 PDF 解析失败：${e instanceof Error ? e.message : e}` });
    return null;
  }
  if (!portraits.length) {
    await appendRunLog(jobId, { level: "warn", msg: "照片集 PDF 中没有找到人像" });
    return 0;
  }

  // Previous crops of this record go; a thumbnail set aside earlier comes back until compared again.
  const old = await d.select({ id: media.id, path: media.path }).from(media).where(and(eq(media.recordId, recordId), like(media.originalUrl, `${DERIVED}%`)));
  if (old.length) {
    await d.delete(media).where(inArray(media.id, old.map((m) => m.id)));
    await Promise.all(old.map((m) => removeMediaFile(m.path)));
  }
  await d.update(media).set({ fieldKey: "childhoodPhotos" }).where(and(eq(media.recordId, recordId), eq(media.fieldKey, CHILDHOOD_THUMB)));

  for (const [i, p] of portraits.entries()) {
    const field = i === 0 ? "childhoodPhotos" : "adulthoodPhotos";
    // The childhood crop sorts before the site's thumbnail (position 0); adult crops from 0.
    const position = i === 0 ? -1 : i - 1;
    const s = sha256(p.jpeg);
    const rel = await writeMediaFile({ slug: "fairfax", externalId: rec.externalId, field, position, sha: s, mime: "image/jpeg", fileName: `${field}.jpg`, buf: p.jpeg });
    await d.insert(media).values({ recordId, kind: "photo", path: rel, sha256: s, mime: "image/jpeg", size: p.jpeg.length, width: p.width, height: p.height, originalUrl: `${DERIVED}${sha}#${i}`, fieldKey: field, position });
  }

  // Same picture as the site's small thumbnail: keep the high-resolution crop in the photo list.
  const thumbs = await d
    .select({ id: media.id, path: media.path })
    .from(media)
    .where(and(eq(media.recordId, recordId), eq(media.fieldKey, "childhoodPhotos"), eq(media.kind, "photo")));
  const crop = await dhash(portraits[0].jpeg);
  let replaced = 0;
  for (const t of thumbs) {
    const buf = await read(t.path);
    if (!buf || buf.equals(portraits[0].jpeg)) continue;
    const near = await dhash(buf).then((h) => hamming(h, crop) <= 12, () => false);
    if (near) {
      await d.update(media).set({ fieldKey: CHILDHOOD_THUMB }).where(eq(media.id, t.id));
      replaced++;
    }
  }
  await appendRunLog(jobId, {
    level: "info",
    msg: `照片集：提取人像 ${portraits.length} 张（童年 1、成年 ${portraits.length - 1}）${replaced ? "，站点童年缩略图与之相同，已以高清版替代" : ""}`,
  });
  return portraits.length;
}

/** Photo-set PDFs of a record, latest first: already moved to PHOTO_SET_PDF, or still under the upload field. */
async function photoSetPdfs(recordId: string) {
  return db()
    .select({ path: media.path })
    .from(media)
    .where(and(eq(media.recordId, recordId), inArray(media.fieldKey, [PHOTO_SET_PDF, PHOTO_SET_FIELD]), eq(media.mime, "application/pdf")))
    .orderBy(desc(media.createdAt));
}

/** Re-crop the portraits from the stored photo-set PDF (after cropper changes); null when the record has none. */
export async function reparseFairfaxPhotoSet(recordId: string): Promise<number | null> {
  const [m] = await photoSetPdfs(recordId);
  const buf = m ? await readMediaFile(m.path) : null;
  if (!buf) return null;
  return applyFairfaxPhotoSet(recordId, null, buf, readMediaFile);
}
