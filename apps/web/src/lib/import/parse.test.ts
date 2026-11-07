import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildJobs, detectMapping, externalIdFromUrl, parseSpreadsheet } from "./parse";
import { readFileSync } from "node:fs";
import path from "node:path";

function xlsxOf(rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseSpreadsheet", () => {
  it("reads headers and string cells from xlsx", () => {
    const sheet = parseSpreadsheet(xlsxOf([["url", "id", "note"], ["https://a.com/x/1", 1, "hi"], ["https://a.com/x/2", 2, ""]]), "a.xlsx");
    expect(sheet.headers).toEqual(["url", "id", "note"]);
    expect(sheet.rows).toEqual([["https://a.com/x/1", "1", "hi"], ["https://a.com/x/2", "2", ""]]);
  });
  it("reads csv", () => {
    const sheet = parseSpreadsheet(Buffer.from("url,id\nhttps://a.com/1,1\n"), "a.csv");
    expect(sheet.headers).toEqual(["url", "id"]);
    expect(sheet.rows).toEqual([["https://a.com/1", "1"]]);
  });
  it("names blank headers", () => {
    const sheet = parseSpreadsheet(xlsxOf([["", "x"], ["a", "b"]]), "a.xlsx");
    expect(sheet.headers).toEqual(["列1", "x"]);
  });
});

describe("detectMapping", () => {
  it("uses the cryobank preset", () => {
    const m = detectMapping(["border-0 href", "rounded-1 src", "donor-number", "donor-card-title"], []);
    expect(m.preset).toBe("cryobank");
    expect(m.urlColumn).toBe("border-0 href");
    expect(m.externalIdColumn).toBe("donor-number");
    expect(m.seedColumns).toEqual(["rounded-1 src", "donor-number", "donor-card-title"]);
  });
  it("guesses url and id columns from headers and values", () => {
    const m = detectMapping(["name", "page", "ref id"], [["a", "https://x.com/1", "9"]]);
    expect(m.urlColumn).toBe("page");
    expect(m.externalIdColumn).toBe("ref id");
  });
});

describe("buildJobs", () => {
  const sheet = { sheetName: "s", headers: ["url", "id", "extra"], rows: [
    ["https://a.com/d/10", "10", "x"],
    ["https://a.com/d/11", "", "y"],
    ["", "12", ""],
    ["not a url", "13", ""],
    ["https://a.com/d/10", "10", "dup"],
  ] };
  it("builds jobs, derives ids from urls, dedupes and reports skips", () => {
    const { jobs, skipped } = buildJobs(sheet, { urlColumn: "url", externalIdColumn: "id", seedColumns: ["id", "extra"] });
    expect(jobs).toEqual([
      { url: "https://a.com/d/10", externalId: "10", seed: { id: "10", extra: "x" } },
      { url: "https://a.com/d/11", externalId: "11", seed: { extra: "y" } },
    ]);
    expect(skipped.map((s) => s.row)).toEqual([4, 5, 6]);
  });
  it("derives ids purely from url when no id column", () => {
    const { jobs } = buildJobs(sheet, { urlColumn: "url", externalIdColumn: "", seedColumns: [] });
    expect(jobs.map((j) => j.externalId)).toEqual(["10", "11"]);
  });
  it("externalIdFromUrl prefers the last numeric segment", () => {
    expect(externalIdFromUrl("https://www.cryobank.com/donor/21383")).toBe("21383");
    expect(externalIdFromUrl("https://x.com/a/b?q=1")).toBe("b");
    expect(externalIdFromUrl("nope")).toBe("");
  });
  it("externalIdFromUrl reads an id query parameter first (Fairfax)", () => {
    expect(externalIdFromUrl("https://fairfaxcryobank.com/search/donorprofile.aspx?number=4920")).toBe("4920");
  });
});

describe("real cryobank.xlsx", () => {
  it("yields 164 jobs", () => {
    const buf = readFileSync(path.join(__dirname, "../../../../../docs/data/cryobank.xlsx"));
    const sheet = parseSpreadsheet(buf, "cryobank.xlsx");
    const m = detectMapping(sheet.headers, sheet.rows);
    const { jobs, skipped } = buildJobs(sheet, m);
    expect(skipped).toEqual([]);
    expect(jobs).toHaveLength(164);
    expect(jobs[0].url).toMatch(/^https:\/\/www\.cryobank\.com\/donor\/\d+$/);
    expect(jobs[0].seed["donor-card-title"]).toBeTruthy();
  });
});
