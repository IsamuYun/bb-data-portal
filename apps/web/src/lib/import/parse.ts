import * as XLSX from "xlsx";

/** A parsed spreadsheet: first row = headers, remaining rows = string cells. */
export type ParsedSheet = { sheetName: string; headers: string[]; rows: string[][] };

export type ImportMapping = {
  /** Header of the column holding the page URL. */
  urlColumn: string;
  /** Header of the column holding the external id; empty = derive from the URL. */
  externalIdColumn: string;
  /** Headers copied into job.seed as provenance. */
  seedColumns: string[];
};

export type BuiltJob = { url: string; externalId: string; seed: Record<string, string> };
export type SkippedRow = { row: number; reason: string };

const MAX_ROWS = 50_000;

export function parseSpreadsheet(buf: Buffer | Uint8Array, filename: string): ParsedSheet {
  const isCsv = /\.(csv|tsv|txt)$/i.test(filename);
  const wb = isCsv
    ? XLSX.read(Buffer.from(buf).toString("utf8"), { type: "string", raw: true })
    : XLSX.read(buf, { type: "buffer", raw: false, cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("文件中没有工作表");
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false, blankrows: false });
  if (matrix.length === 0) throw new Error("工作表为空");
  if (matrix.length - 1 > MAX_ROWS) throw new Error(`行数超过上限 ${MAX_ROWS}`);
  const headers = (matrix[0] as unknown[]).map((h, i) => {
    const s = String(h ?? "").trim();
    return s || `列${i + 1}`;
  });
  const rows = matrix.slice(1).map((r) => headers.map((_, i) => String((r as unknown[])[i] ?? "").trim()));
  return { sheetName, headers, rows };
}

/** Known column layouts. Matched when every listed header is present. */
const PRESETS: { name: string; urlColumn: string; externalIdColumn: string }[] = [
  { name: "cryobank", urlColumn: "border-0 href", externalIdColumn: "donor-number" },
];

export function detectMapping(headers: string[], rows: string[][]): ImportMapping & { preset?: string } {
  for (const p of PRESETS) {
    if (headers.includes(p.urlColumn) && headers.includes(p.externalIdColumn)) {
      return { preset: p.name, urlColumn: p.urlColumn, externalIdColumn: p.externalIdColumn, seedColumns: headers.filter((h) => h !== p.urlColumn) };
    }
  }
  const lower = headers.map((h) => h.toLowerCase());
  const sample = rows.slice(0, 20);
  const looksLikeUrl = (i: number) => sample.length > 0 && sample.filter((r) => /^https?:\/\//i.test(r[i] ?? "")).length >= Math.ceil(sample.length / 2);
  let urlIdx = lower.findIndex((h, i) => /(href|url|link|链接|网址)/.test(h) && looksLikeUrl(i));
  if (urlIdx < 0) urlIdx = lower.findIndex((_, i) => looksLikeUrl(i));
  const idIdx = lower.findIndex((h, i) => i !== urlIdx && /(^id$|_id$|-id$|\bid\b|number|编号|序号)/.test(h));
  const urlColumn = urlIdx >= 0 ? headers[urlIdx] : "";
  const externalIdColumn = idIdx >= 0 ? headers[idIdx] : "";
  return { urlColumn, externalIdColumn, seedColumns: headers.filter((h) => h !== urlColumn) };
}

/** An id query parameter (`donorprofile.aspx?number=1234`), else the last numeric path segment, else the last path segment. */
export function externalIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const p of ["number", "id", "donor", "donorId"]) {
      const v = u.searchParams.get(p)?.trim();
      if (v) return v;
    }
    const segs = u.pathname.split("/").filter(Boolean);
    const numeric = [...segs].reverse().find((s) => /^\d+$/.test(s));
    return numeric ?? segs.at(-1) ?? "";
  } catch {
    return "";
  }
}

export function buildJobs(sheet: ParsedSheet, mapping: ImportMapping): { jobs: BuiltJob[]; skipped: SkippedRow[] } {
  const { headers, rows } = sheet;
  const urlIdx = headers.indexOf(mapping.urlColumn);
  if (urlIdx < 0) throw new Error(`找不到 URL 列 “${mapping.urlColumn}”`);
  const idIdx = mapping.externalIdColumn ? headers.indexOf(mapping.externalIdColumn) : -1;
  if (mapping.externalIdColumn && idIdx < 0) throw new Error(`找不到 ID 列 “${mapping.externalIdColumn}”`);
  const seedIdx = mapping.seedColumns.map((c) => headers.indexOf(c)).filter((i) => i >= 0 && i !== urlIdx);

  const jobs: BuiltJob[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const rowNo = i + 2; // 1-based, after header
    const url = (r[urlIdx] ?? "").trim();
    if (!url) return skipped.push({ row: rowNo, reason: "URL 为空" });
    if (!/^https?:\/\/\S+$/i.test(url)) return skipped.push({ row: rowNo, reason: `URL 无效：${url.slice(0, 60)}` });
    const externalId = (idIdx >= 0 ? (r[idIdx] ?? "").trim() : "") || externalIdFromUrl(url);
    if (!externalId) return skipped.push({ row: rowNo, reason: "无法确定外部 ID" });
    const key = externalId.toLowerCase();
    if (seen.has(key)) return skipped.push({ row: rowNo, reason: `重复的 ID ${externalId}` });
    seen.add(key);
    const seed: Record<string, string> = {};
    for (const si of seedIdx) if (r[si]) seed[headers[si]] = r[si];
    jobs.push({ url, externalId, seed });
  });
  return { jobs, skipped };
}
