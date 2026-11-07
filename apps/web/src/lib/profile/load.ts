import { asc, db, eq, media, records } from "@bb/db";
import { cachedJpegs, diskMediaLoader } from "@/lib/export/images";
import { loadTranslations, translateRecords } from "@/lib/translate/records";
import type { ProfileImages } from "./html";
import { buildProfileModel, type ProfileModel } from "./model";

/** Image boxes in px (≈2× the printed size; adult photos are 290:300 like the template). */
const ADULT = { width: 580, height: 600 };
const CHILD = 300;
/** Longest the export waits for the model to fill translation gaps; after that it uses what the cache has. */
const TRANSLATE_WAIT_MS = 60_000;

export async function loadProfile(recordId: string): Promise<{ model: ProfileModel; images: ProfileImages } | null> {
  const d = db();
  const [r] = await d.select().from(records).where(eq(records.id, recordId)).limit(1);
  if (!r) return null;
  // Bring the translation up to date (no-op when the cache is current and complete): a report parsed after the last
  // translation, or phrases the model skipped, would otherwise print in English.
  await Promise.race([translateRecords([recordId]).catch((e) => console.warn(`[profile ${recordId}] translate`, e)), new Promise((ok) => setTimeout(ok, TRANSLATE_WAIT_MS))]);
  const [ms, tr] = await Promise.all([
    d
      .select({ id: media.id, fieldKey: media.fieldKey, position: media.position, path: media.path, mime: media.mime, kind: media.kind })
      .from(media)
      .where(eq(media.recordId, recordId))
      .orderBy(asc(media.position)),
    loadTranslations([recordId]),
  ]);
  const model = buildProfileModel({ externalId: r.externalId, data: r.data, zh: tr.get(recordId)?.data ?? null, media: ms, manual: r.manual });
  const adult = cachedJpegs(diskMediaLoader, ADULT, { cover: true });
  const child = cachedJpegs(diskMediaLoader, CHILD, { cover: true });
  const images: ProfileImages = new Map();
  for (const m of model.adultPhotos) images.set(m.id, await adult(m));
  for (const m of model.childPhotos) images.set(m.id, await child(m));
  return { model, images };
}

export const profileFileName = (donorNo: string, ext: "html" | "pdf") => `babiology_family_donor_${donorNo.replace(/[^A-Za-z0-9_-]/g, "_")}.${ext}`;
