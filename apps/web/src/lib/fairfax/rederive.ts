import { and, db, eq, media, platforms, records, sql } from "@bb/db";
import type { PageBlock } from "@bb/shared";
import { FAIRFAX_MEDICAL_KEYS, FAIRFAX_MEDICAL_PARSER_VERSION, isLegacyCapture, withFairfaxMedical } from "./medical";

/**
 * Boot step: re-derive the medical fields of Fairfax records whose capture was parsed by an older parser version
 * (or never). Changing a derived field = bump FAIRFAX_MEDICAL_PARSER_VERSION and restart; no re-collection needed.
 * Translations follow on demand (exports and the profile re-translate changed fields only).
 */
export async function rederiveFairfaxMedical(log: (m: string) => void = () => {}) {
  const d = db();
  const [p] = await d.select({ id: platforms.id }).from(platforms).where(eq(platforms.slug, "fairfax")).limit(1);
  if (!p) return;
  const rows = await d
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(
      and(
        eq(records.platformId, p.id),
        sql`jsonb_typeof(${records.data}->'medicalProfile') = 'array'`,
        sql`coalesce(${records.data}->>'medicalParserVersion', '') <> ${String(FAIRFAX_MEDICAL_PARSER_VERSION)}`,
      ),
    );
  let parsed = 0;
  let legacy = 0;
  for (const r of rows) {
    const old = isLegacyCapture(r.data.medicalProfile as PageBlock[]);
    let next = withFairfaxMedical(r.data);
    if (old) {
      legacy++;
      next = Object.fromEntries(Object.entries(r.data).filter(([k]) => !(FAIRFAX_MEDICAL_KEYS as readonly string[]).includes(k)));
    } else parsed++;
    if (JSON.stringify(next) !== JSON.stringify(r.data)) await d.update(records).set({ data: next }).where(eq(records.id, r.id));
  }
  if (rows.length) log(`fairfax medical: ${parsed} 条按解析器 v${FAIRFAX_MEDICAL_PARSER_VERSION} 重新解析，${legacy} 条为旧版采集（需重采）`);
}

/**
 * Boot step: parse stored Fairfax report PDFs that no current parser has seen — Genetic Testing summaries parsed by
 * an older FAIRFAX_GENETIC_PARSER_VERSION (or never), and photo-set PDFs still filed as adult photos (uploaded before
 * the cropper existed). Runs in the background: cropping takes about a second per PDF.
 */
export async function rederiveFairfaxReports(log: (m: string) => void = () => {}) {
  const d = db();
  const [p] = await d.select({ id: platforms.id }).from(platforms).where(eq(platforms.slug, "fairfax")).limit(1);
  if (!p) return;
  const { GENETIC_FIELD, reparseFairfaxGenetic } = await import("./genetic-apply");
  const { FAIRFAX_GENETIC_PARSER_VERSION } = await import("./genetic");
  const { PHOTO_SET_FIELD, reparseFairfaxPhotoSet } = await import("./photoset-apply");

  // Parsed by an older version, or never parsed but holding the genetic PDF (possibly filed under another field).
  const genetic = await d
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.platformId, p.id),
        sql`coalesce(${records.data}->>'geneticParserVersion', '') <> ${String(FAIRFAX_GENETIC_PARSER_VERSION)}`,
        sql`(${records.data} ? 'geneticParserVersion' or exists (select 1 from ${media} where ${media}.record_id = ${records}.id and ${media}.field_key = ${GENETIC_FIELD}))`,
      ),
    );
  let ok = 0;
  for (const r of genetic) if ((await reparseFairfaxGenetic(r.id).catch(() => null))?.geneticTests.length) ok++;
  if (genetic.length) log(`fairfax genetic: ${genetic.length} 份基因检测 PDF 按解析器 v${FAIRFAX_GENETIC_PARSER_VERSION} 解析，${ok} 份提取到汇总表`);

  const sets = await d
    .selectDistinct({ id: records.id })
    .from(records)
    .innerJoin(media, eq(media.recordId, records.id))
    .where(and(eq(records.platformId, p.id), eq(media.fieldKey, PHOTO_SET_FIELD), eq(media.mime, "application/pdf")));
  let photos = 0;
  for (const r of sets) photos += (await reparseFairfaxPhotoSet(r.id).catch(() => null)) ?? 0;
  if (sets.length) log(`fairfax photo sets: ${sets.length} 份照片集 PDF 裁出人像 ${photos} 张`);
}
