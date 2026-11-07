import { and, asc, db, eq, ilike, media, or, platforms, records, sql, type SQL } from "@bb/db";
import type { ExportFilters, ExportInput, ExportMedia, ExportPlatform, ExportRecord } from "./types";

export function recordsWhere(platformId: string, f: ExportFilters): SQL {
  const parts: SQL[] = [eq(records.platformId, platformId)];
  const q = f.q?.trim();
  if (q) parts.push(or(ilike(records.externalId, `%${q}%`), sql`${records.data}::text ilike ${"%" + q + "%"}`)!);
  if (f.withMediaOnly) parts.push(sql`exists (select 1 from ${media} where ${media}.record_id = ${records}.id)`);
  return and(...parts)!;
}

/** Load a platform and every matching record (with media rows) in external-id order. */
export async function loadExportInput(platformId: string, f: ExportFilters): Promise<ExportInput | null> {
  const d = db();
  const [p] = await d.select().from(platforms).where(eq(platforms.id, platformId)).limit(1);
  if (!p) return null;
  const platform: ExportPlatform = { id: p.id, slug: p.slug, name: p.name, baseUrl: p.baseUrl, fieldSchema: p.fieldSchema };
  const rows = await d
    .select({ id: records.id, externalId: records.externalId, version: records.version, data: records.data, sourceUrl: records.sourceUrl, capturedAt: records.capturedAt })
    .from(records)
    .where(recordsWhere(platformId, f))
    .orderBy(asc(records.externalId));
  const byRecord = new Map<string, ExportMedia[]>();
  if (rows.length) {
    const ms = await d
      .select({ id: media.id, recordId: media.recordId, fieldKey: media.fieldKey, position: media.position, path: media.path, mime: media.mime, kind: media.kind })
      .from(media)
      .innerJoin(records, eq(records.id, media.recordId))
      .where(recordsWhere(platformId, f))
      .orderBy(asc(media.position));
    for (const m of ms) {
      const list = byRecord.get(m.recordId) ?? [];
      list.push({ id: m.id, fieldKey: m.fieldKey, position: m.position, path: m.path, mime: m.mime, kind: m.kind });
      byRecord.set(m.recordId, list);
    }
  }
  const out: ExportRecord[] = rows.map((r) => ({ ...r, media: byRecord.get(r.id) ?? [] }));
  return { platform, records: out, generatedAt: new Date() };
}
