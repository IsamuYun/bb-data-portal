import fs from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { cellText } from "@/lib/format";
import { cachedJpegs } from "./images";
import { photosFor, splitSchema, type ExportInput, type ExportRecord, type MediaLoader } from "./types";

export const PDF_PHOTO_PX = 300;
const PHOTOS_PER_FIELD = 5;
export const FAMILY = "Noto Sans SC";

/** Font files live in apps/web/assets/fonts (traced into the standalone build via next.config). */
function fontsDir() {
  for (const c of [path.join(process.cwd(), "assets/fonts"), path.join(process.cwd(), "apps/web/assets/fonts")]) {
    if (fs.existsSync(path.join(c, "NotoSansSC-Regular.ttf"))) return c;
  }
  throw new Error("找不到 PDF 字体目录 assets/fonts");
}

let fontsReady = false;
export function ensureFonts() {
  if (fontsReady) return;
  const dir = fontsDir();
  Font.register({
    family: FAMILY,
    fonts: [
      { src: path.join(dir, "NotoSansSC-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSansSC-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // react-pdf only breaks lines at ASCII spaces. `breakable()` inserts a hair space (zero-width glyph
  // in our font) between CJK characters, and this callback turns those into glue nodes without hyphens.
  Font.registerHyphenationCallback((word) => word.split(/(\u200A)/).filter(Boolean));
  fontsReady = true;
}

const CJK = /[\u2E80-\u2FDF\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
const CLOSE = /[\u201D\u2019，。、；：！？）》」』】〕〉\u3001-\u3003\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF09)\].,;:!?]/;
const OPEN = /[\u201C\u2018（《「『【〔〈(\[]/;
/** Make CJK runs wrappable: a break opportunity after every CJK character (not before closing punctuation). */
export function breakable(text: string): string {
  // Noto Sans SC draws curly quotes full-width; use ASCII quotes inside Latin text (It’s → It's).
  text = text.replace(/(?<=[A-Za-z0-9])[\u2018\u2019](?=[A-Za-z0-9\s.,;:!?)])|(?<=[\s(]|^)[\u2018\u2019](?=[A-Za-z0-9])/g, "'").replace(/(?<=[A-Za-z0-9.,!?])[\u201C\u201D]|[\u201C\u201D](?=[A-Za-z0-9])/g, '"');
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    out += ch;
    if (!next || next === "\u200A" || /\s/.test(next) || /\s/.test(ch)) continue;
    if (CJK.test(ch) && !CLOSE.test(next)) out += "\u200A";
    else if (!CJK.test(ch) && CJK.test(next) && !OPEN.test(ch)) out += "\u200A";
  }
  return out;
}

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 9.5, paddingTop: 36, paddingBottom: 44, paddingHorizontal: 40, color: "#111827" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: "#111827", paddingBottom: 6, marginBottom: 10 },
  id: { fontSize: 18, fontWeight: 700 },
  title: { fontSize: 11, marginTop: 2, color: "#374151" },
  meta: { fontSize: 8, color: "#6b7280", textAlign: "right" },
  photosRow: { flexDirection: "column", gap: 8, marginBottom: 10 },
  photoGroup: { flexDirection: "column", gap: 3 },
  groupLabel: { fontSize: 8, color: "#6b7280" },
  photoStrip: { flexDirection: "row", gap: 4 },
  photo: { width: 96, height: 96, objectFit: "cover", borderRadius: 3, backgroundColor: "#f3f4f6" },
  photoEmpty: { width: 96, height: 96, borderRadius: 3, borderWidth: 0.5, borderColor: "#d1d5db", alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  cell: { width: "33.33%", paddingRight: 10, paddingVertical: 3 },
  cellWide: { width: "100%", paddingRight: 10, paddingVertical: 3 },
  label: { fontSize: 7.5, color: "#6b7280", marginBottom: 1 },
  value: { fontSize: 9.5 },
  section: { marginTop: 6 },
  sectionTitle: { fontSize: 9, fontWeight: 700, borderBottomWidth: 0.5, borderBottomColor: "#d1d5db", paddingBottom: 2, marginBottom: 4 },
  para: { fontSize: 9, lineHeight: 1.5, color: "#1f2937" },
  footer: { position: "absolute", left: 40, right: 40, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#9ca3af" },
  empty: { color: "#9ca3af" },
});

type Jpeg = (m: ExportRecord["media"][number]) => Promise<Buffer | null>;
type Photos = Record<string, Record<string, Buffer | null>>;

/** Long sections: one line per array item (e.g. one GTS carrier per line). */
const longText = (v: unknown) => (Array.isArray(v) ? (v.length ? v.map(cellText).join("\n") : "无") : cellText(v));

function Card({ input, r, photos }: { input: ExportInput; r: ExportRecord; photos: Photos }) {
  const { values, photos: photoFields } = splitSchema(input.platform.fieldSchema);
  const short = values.filter((f) => f.type !== "text" && f.type !== "json");
  const long = values.filter((f) => f.type === "text" || f.type === "json");
  const titleKey = short.find((f) => f.key === "title")?.key;
  return (
    <Page size="A4" style={s.page} wrap>
      <View style={s.header} fixed={false}>
        <View>
          <Text style={s.id}>{r.externalId}</Text>
          {titleKey && r.data[titleKey] ? <Text style={s.title}>{breakable(cellText(r.data[titleKey]))}</Text> : null}
        </View>
      </View>

      {photoFields.length > 0 ? (
        <View style={s.photosRow}>
          {photoFields.map((f) => {
            const ms = photosFor(r, f.key, PHOTOS_PER_FIELD);
            return (
              <View key={f.key} style={s.photoGroup}>
                <Text style={s.groupLabel}>{f.label}</Text>
                <View style={s.photoStrip}>
                  {ms.length === 0 ? (
                    <View style={s.photoEmpty}>
                      <Text style={[s.label, { marginBottom: 0 }]}>无照片</Text>
                    </View>
                  ) : (
                    ms.map((m) => {
                      const buf = photos[r.id]?.[m.id];
                      // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images have no alt prop
                      return buf ? <Image key={m.id} style={s.photo} src={{ data: buf, format: "jpg" }} /> : <View key={m.id} style={s.photoEmpty} />;
                    })
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={s.grid}>
        {short
          .filter((f) => f.key !== titleKey)
          .map((f) => {
            const v = r.data[f.key];
            const text = cellText(v);
            const wide = f.type === "string[]" && text.length > 40;
            return (
              <View key={f.key} style={wide ? s.cellWide : s.cell} wrap={false}>
                <Text style={s.label}>{f.label}</Text>
                <Text style={[s.value, v == null || v === "" ? s.empty : {}]}>{breakable(text)}</Text>
              </View>
            );
          })}
      </View>

      {long.map((f) => (
        <View key={f.key} style={s.section}>
          <Text style={s.sectionTitle}>{f.label}</Text>
          <Text style={[s.para, r.data[f.key] ? {} : s.empty]}>{breakable(longText(r.data[f.key]))}</Text>
        </View>
      ))}

      <View style={s.footer} fixed>
        <Text />
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

/** One A4 card per record: photos, template fields in a grid, long text sections. No provenance (source URL / time / version) and no platform identity anywhere in the file. */
export async function buildPdf(input: ExportInput, load: MediaLoader): Promise<Buffer> {
  ensureFonts();
  const jpeg: Jpeg = cachedJpegs(load, PDF_PHOTO_PX, { cover: true });
  const { photos: photoFields } = splitSchema(input.platform.fieldSchema);
  const photos: Photos = {};
  for (const r of input.records) {
    const map: Record<string, Buffer | null> = {};
    for (const f of photoFields) for (const m of photosFor(r, f.key, PHOTOS_PER_FIELD)) map[m.id] = await jpeg(m);
    photos[r.id] = map;
  }
  const doc = (
    <Document title="导出" creationDate={input.generatedAt}>
      {input.records.length === 0 ? (
        <Page size="A4" style={s.page}>
          <Text style={s.empty}>没有匹配的记录。</Text>
        </Page>
      ) : (
        input.records.map((r) => <Card key={r.id} input={input} r={r} photos={photos} />)
      )}
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
