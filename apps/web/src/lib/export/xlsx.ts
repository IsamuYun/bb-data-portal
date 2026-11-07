import ExcelJS from "exceljs";
import { cellText } from "@/lib/format";
import { cachedJpegs } from "./images";
import { photosFor, splitSchema, type ExportInput, type MediaLoader } from "./types";

/** Thumbnails are displayed at 40×60 px in the sheet; the embedded JPEG is 200×300 so zooming in stays sharp. */
export const XLSX_THUMB = { width: 40, height: 60 };
export const XLSX_IMAGE = { width: 200, height: 300 };
export const XLSX_THUMBS_PER_FIELD = 2;
const PAD = 4;
const ROW_HEIGHT_PT = (XLSX_THUMB.height + PAD * 2) * 0.75;
const THUMB_COL_WIDTH = Math.ceil((XLSX_THUMB.width + PAD * 2) / 7);

/**
 * One row per record. Columns: the first value field (编号), then two thumbnail columns per photo field,
 * then the remaining value fields with long-text fields (简介) placed right after the title.
 * Provenance (source URL, capture time, version), the platform / site identity and photo URLs / file paths are intentionally not exported.
 */
export async function buildXlsx(input: ExportInput, load: MediaLoader): Promise<Buffer> {
  const { platform, records } = input;
  const { values, photos } = splitSchema(platform.fieldSchema);
  const [first, ...rest] = orderValues(values);
  const thumb = cachedJpegs(load, XLSX_IMAGE, { cover: true });
  const hasPhotos = photos.length > 0 && records.some((r) => r.media.length > 0);

  const wb = new ExcelJS.Workbook();
  wb.created = input.generatedAt;
  const ws = wb.addWorksheet("记录", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });

  const columns: Partial<ExcelJS.Column>[] = [];
  const valueColumn = (f: (typeof values)[number]) => ({ header: f.label, key: `f:${f.key}`, width: f.type === "text" || f.type === "json" ? 60 : f.type === "string[]" ? 28 : 16 });
  if (first) columns.push(valueColumn(first));
  for (const f of photos) {
    for (let k = 0; k < XLSX_THUMBS_PER_FIELD; k++) columns.push({ header: `${f.label} ${k + 1}`, key: `img:${f.key}:${k}`, width: THUMB_COL_WIDTH });
  }
  for (const f of rest) columns.push(valueColumn(f));
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };

  for (const [i, r] of records.entries()) {
    const rowIdx = i + 2;
    const row: Record<string, unknown> = {};
    for (const f of values) row[`f:${f.key}`] = cellValue(r.data[f.key], f.type);
    const xr = ws.addRow(row);
    xr.alignment = { vertical: "top", wrapText: true };
    if (hasPhotos) xr.height = ROW_HEIGHT_PT;

    for (const f of photos) {
      const ms = photosFor(r, f.key, XLSX_THUMBS_PER_FIELD);
      for (const [k, m] of ms.entries()) {
        const jpg = await thumb(m);
        if (!jpg) continue;
        const col = ws.getColumn(`img:${f.key}:${k}`).number - 1;
        const id = wb.addImage({ buffer: jpg as unknown as ExcelJS.Buffer, extension: "jpeg" });
        ws.addImage(id, {
          tl: { col: col + PAD / (THUMB_COL_WIDTH * 7), row: rowIdx - 1 + PAD / (ROW_HEIGHT_PT / 0.75) },
          ext: { width: XLSX_THUMB.width, height: XLSX_THUMB.height },
          editAs: "oneCell",
        });
      }
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const info = wb.addWorksheet("说明");
  info.columns = [{ width: 14 }, { width: 60 }];
  info.addRows([
    ["记录数", records.length],
    ["生成时间", input.generatedAt],
    ["照片", `每个照片字段最多 ${XLSX_THUMBS_PER_FIELD} 张缩略图（显示 ${XLSX_THUMB.width}×${XLSX_THUMB.height}，原图 ${XLSX_IMAGE.width}×${XLSX_IMAGE.height}）；全部照片见后台记录详情`],
  ]);
  info.getCell("B2").numFmt = "yyyy-mm-dd hh:mm";

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Keep template order, except long-text fields (简介) move to directly after the title field. */
export function orderValues<T extends { key: string; type: string }>(values: T[]): T[] {
  const titleIdx = values.findIndex((f) => f.key === "title");
  if (titleIdx < 0) return values;
  const long = values.filter((f, i) => f.type === "text" && i !== titleIdx);
  if (long.length === 0) return values;
  const others = values.filter((f) => !long.includes(f));
  const at = others.indexOf(values[titleIdx]) + 1;
  return [...others.slice(0, at), ...long, ...others.slice(at)];
}

function cellValue(v: unknown, type: string): unknown {
  if (v == null || v === "") return null;
  if (type === "number") {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(n) ? n : cellText(v);
  }
  // json: [] means "checked, none found" (e.g. no GTS carriers), unlike a missing value.
  if (Array.isArray(v)) return v.length === 0 && type === "json" ? "无" : v.map(cellText).join("\n");
  return cellText(v);
}
