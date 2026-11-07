import ExcelJS from "exceljs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildPdf } from "./pdf";
import type { ExportInput, ExportMedia, ExportRecord } from "./types";
import { buildXlsx, orderValues, XLSX_THUMBS_PER_FIELD } from "./xlsx";

const schema: ExportInput["platform"]["fieldSchema"] = [
  { key: "donorNumber", label: "编号", type: "string" },
  { key: "title", label: "标题", type: "string" },
  { key: "bmi", label: "BMI", type: "number" },
  { key: "ancestry", label: "祖源", type: "string[]" },
  { key: "about", label: "简介", type: "text" },
  { key: "childhoodPhotos", label: "童年照片", type: "url" },
  { key: "adulthoodPhotos", label: "成年照片", type: "url" },
];

const media = (id: string, fieldKey: string, position: number, mime = "image/webp"): ExportMedia => ({ id, fieldKey, position, path: `cryobank/${id}.webp`, mime, kind: "photo" });

function record(n: number, withPhotos: boolean): ExportRecord {
  return {
    id: `r${n}`,
    externalId: `1000${n}`,
    version: 1,
    data: {
      donorNumber: `1000${n}`,
      title: `Donor ${n} — 热爱音乐的工程师`,
      bmi: "23.4",
      ancestry: ["German", "Irish", "Polish", "Chinese"],
      about: "他是一位性格开朗、热爱户外运动的软件工程师。".repeat(12) + "\n\nSecond paragraph in English, long enough to wrap across the page a couple of times. ".repeat(4),
    },
    sourceUrl: `https://example.com/donor/1000${n}`,
    capturedAt: new Date("2026-10-31T10:00:00Z"),
    media: withPhotos ? [media(`c${n}a`, "childhoodPhotos", 0), media(`c${n}b`, "childhoodPhotos", 1), media(`a${n}a`, "adulthoodPhotos", 0), media(`a${n}b`, "adulthoodPhotos", 1), media(`a${n}c`, "adulthoodPhotos", 2), media(`a${n}d`, "adulthoodPhotos", 3)] : [],
  };
}

const input: ExportInput = {
  platform: { id: "p", slug: "cryobank", name: "Cryobank", baseUrl: "https://example.com", fieldSchema: schema },
  records: [record(1, true), record(2, false), record(3, true)],
  generatedAt: new Date("2026-10-31T12:00:00Z"),
};

/** Fake MEDIA_DIR: every media id resolves to a generated webp of its own colour; one id is "missing". */
const loader = async (m: ExportMedia) => {
  if (m.id === "a1d") return null;
  const hue = (m.id.charCodeAt(0) * 37 + m.id.charCodeAt(1) * 11 + m.id.charCodeAt(2) * 5) % 360;
  return sharp({ create: { width: 300, height: 200, channels: 3, background: `hsl(${hue}, 60%, 55%)` } }).webp().toBuffer();
};
const OUT = process.env.EXPORT_TEST_OUT;
const dump = async (name: string, buf: Buffer) => OUT && (await (await import("node:fs/promises")).writeFile(`${OUT}/${name}`, buf));

describe("buildXlsx", () => {
  it("writes one row per record: 编号, two thumbnails per photo field, 简介 after 标题, no external id or photo paths", async () => {
    const buf = await buildXlsx(input, loader);
    await dump("sample.xlsx", buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet("记录")!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(["编号", "童年照片 1", "童年照片 2", "成年照片 1", "成年照片 2", "标题", "简介", "BMI", "祖源"]);
    expect(ws.rowCount).toBe(4);
    expect(ws.getCell("A2").value).toBe("10001");
    expect(ws.getCell("H2").value).toBe(23.4);
    expect(ws.getCell("I2").value).toBe("German\nIrish\nPolish\nChinese");
    expect(JSON.stringify(ws.getRow(2).values)).not.toContain("webp");
    expect(JSON.stringify(ws.getRow(2).values)).not.toContain("example.com");
    // record 1: 2 childhood + 2 adult (3rd/4th exceed the limit); record 3: 2 + 2 → 8 embedded images
    const images = ws.getImages();
    expect(images.length).toBe(2 * 2 * XLSX_THUMBS_PER_FIELD);
    const first = images.find((im) => Math.floor(im.range.tl.row) === 1 && Math.floor(im.range.tl.col) === 1)!;
    expect((first.range as unknown as { ext: { width: number; height: number } }).ext).toEqual({ width: 40, height: 60 });
    const meta = await sharp(wb.getImage(Number(first.imageId)).buffer as unknown as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([200, 300]);
    const info = wb.getWorksheet("说明")!;
    expect(info.getCell("B1").value).toBe(3);
    expect(JSON.stringify(info.getSheetValues())).not.toMatch(/Cryobank|example\.com/);
    expect(JSON.stringify(ws.getSheetValues())).not.toContain("Cryobank");
  });

  it("orders long text right after the title", () => {
    const keys = (fs: { key: string; type: string }[]) => orderValues(fs).map((f) => f.key);
    expect(keys([{ key: "n", type: "string" }, { key: "title", type: "string" }, { key: "x", type: "number" }, { key: "about", type: "text" }])).toEqual(["n", "title", "about", "x"]);
    expect(keys([{ key: "n", type: "string" }, { key: "about", type: "text" }])).toEqual(["n", "about"]);
  });
});

describe("buildPdf", () => {
  it("renders one card per record with embedded CJK text", async () => {
    const buf = await buildPdf(input, loader);
    await dump("sample.pdf", buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = buf.toString("latin1");
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(text).toContain("NotoSansSC");
    expect(text).not.toContain("example.com");
    expect(text).not.toContain("Cryobank");
    // record 1: 2 childhood + 3 adult (one file missing); record 3: 2 + 4
    expect((text.match(/\/Subtype\s*\/Image/g) ?? []).length).toBe(2 + 3 + 2 + 4);
  }, 30000);

  it("renders an empty document without records", async () => {
    const buf = await buildPdf({ ...input, records: [] }, loader);
    expect(buf.length).toBeGreaterThan(500);
  });
});

describe("breakable", () => {
  it("adds break opportunities inside CJK runs and keeps Latin text intact", async () => {
    const { breakable } = await import("./pdf");
    expect(breakable("他是工程师。Hello world")).toBe("他 是 工 程 师。 Hello world");
    expect(breakable("It’s a “test”")).toBe("It's a \"test\"");
    expect(breakable("他说：“你好”")).toBe("他 说： “你 好”");
  });
});
