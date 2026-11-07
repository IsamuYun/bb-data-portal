import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { applyGtsReport, GTS_FIELD } from "@/lib/gts/apply";
import { applyDonorProfile, PROFILE_FIELD } from "@/lib/donor-profile/apply";
import { applyMedicalReport, MEDICAL_FIELD } from "@/lib/medical/apply";

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/mpeg": "mp3", "audio/mp4": "m4a", "application/pdf": "pdf", "text/html": "html" };

/** Report PDFs a record can carry (media field key → label). Their content is parsed into `records.data`. */
export const DOC_FIELDS: Record<string, string> = { gtsReport: "GTS 报告", medicalReport: "病史报告", profileReport: "详细资料", essayReport: "个人随笔" };

export const isPdf = (mime: string, buf: Buffer) => mime === "application/pdf" || buf.subarray(0, 5).toString() === "%PDF-";
export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

/** Write the bytes under MEDIA_DIR/<slug>/<externalId>/ and return the path relative to MEDIA_DIR. */
export async function writeMediaFile(o: { slug: string; externalId: string; field: string; position: number; sha: string; mime: string; fileName: string; buf: Buffer }) {
  const ext = EXT[o.mime] ?? (path.extname(o.fileName).slice(1) || "bin");
  const rel = path.join(o.slug, safe(o.externalId), `${o.field}-${o.position}-${o.sha.slice(0, 12)}.${ext}`);
  const abs = path.join(env.MEDIA_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, o.buf);
  return rel;
}

/** Remove a stored file (best-effort) and its record folder when that is now empty. */
/** Bytes of a stored media file (null when missing). */
export async function readMediaFile(rel: string): Promise<Buffer | null> {
  return fs.readFile(path.join(env.MEDIA_DIR, rel)).catch(() => null);
}

export async function removeMediaFile(rel: string) {
  const abs = path.join(env.MEDIA_DIR, rel);
  await fs.rm(abs, { force: true }).catch(() => {});
  await fs.rmdir(path.dirname(abs)).catch(() => {});
}

/** Parse a cryobank report PDF into the record by rules (no model, well under a second). Never throws. */
export async function applyReport(o: { slug: string; recordId: string; jobId: string | null; field: string; buf: Buffer; mime: string }) {
  if (o.slug === "fairfax" && isPdf(o.mime, o.buf)) {
    // Lazy: keeps the PDF / image tooling out of every route that imports the store.
    if (o.field === "adulthoodPhotos") await (await import("@/lib/fairfax/photoset-apply")).applyFairfaxPhotoSet(o.recordId, o.jobId, o.buf, readMediaFile);
    if (o.field === "geneticReport") await (await import("@/lib/fairfax/genetic-apply")).applyFairfaxGenetic(o.recordId, o.jobId, o.buf);
    return;
  }
  if (o.slug !== "cryobank" || !isPdf(o.mime, o.buf)) return;
  if (o.field === GTS_FIELD) await applyGtsReport(o.recordId, o.jobId, o.buf);
  if (o.field === MEDICAL_FIELD) await applyMedicalReport(o.recordId, o.jobId, o.buf);
  if (o.field === PROFILE_FIELD) await applyDonorProfile(o.recordId, o.jobId, o.buf);
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "_";
