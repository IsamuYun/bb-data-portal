import type { FieldSchema } from "@bb/db";

/** Filters stored on the export row (same semantics as the records list). */
/** `translate`: true = 中文 (dictionary + model), false/absent = 英文原文 (captured text as-is). */
export type ExportFilters = { q?: string; withMediaOnly?: boolean; translate?: boolean };

export type ExportMedia = { id: string; fieldKey: string | null; position: number; path: string; mime: string; kind: string };

export type ExportRecord = {
  id: string;
  externalId: string;
  version: number;
  data: Record<string, unknown>;
  sourceUrl: string;
  capturedAt: Date;
  media: ExportMedia[];
};

export type ExportPlatform = { id: string; slug: string; name: string; baseUrl: string; fieldSchema: FieldSchema };

export type ExportInput = { platform: ExportPlatform; records: ExportRecord[]; generatedAt: Date };

/** Resolves a media row to its bytes; returns null when the file is missing or unreadable. */
export type MediaLoader = (m: ExportMedia) => Promise<Buffer | null>;

export const PHOTO_KINDS = new Set(["photo", "screenshot"]);

/** url-typed fields are photo galleries (media rows carry fieldKey); everything else is a value column. */
export function splitSchema(schema: FieldSchema) {
  return {
    values: schema.filter((f) => f.type !== "url"),
    photos: schema.filter((f) => f.type === "url"),
  };
}

export function photosFor(r: ExportRecord, fieldKey: string, max: number) {
  return r.media
    .filter((m) => m.fieldKey === fieldKey && PHOTO_KINDS.has(m.kind))
    .sort((a, b) => a.position - b.position)
    .slice(0, max);
}
