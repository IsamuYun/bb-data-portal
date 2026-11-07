import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ComponentProps } from "react";
import { breakable, ensureFonts, FAMILY } from "@/lib/export/pdf";
import type { ProfileImages } from "./html";
import type { ProfileModel } from "./model";

/** US Letter, same proportions as docs/template/babiology_family_donor_*.pdf (612 × 792 pt). */
const C = { ink: "#16352d", muted: "#5f7f74", line: "#d6e0dc", panel: "#f1f5f3", panelLine: "#d3ddd8", warm: "#f4f0e7", warmLine: "#e2dccd", bar: "#123d33", zebra: "#eaf1ee", ph: "#eef1ef" };
const PX = 40; // horizontal padding
const W = 612 - PX * 2;

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, color: C.ink, paddingTop: 0, paddingBottom: 46, paddingHorizontal: PX, fontSize: 9 },
  bar: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: C.bar },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 24 },
  brand: { fontSize: 15 },
  tag: { fontSize: 7.5, color: C.muted, marginRight: 86, marginBottom: 2 },
  h1: { fontSize: 20, marginTop: 6, paddingBottom: 9, borderBottomWidth: 0.75, borderBottomColor: C.line, marginBottom: 10 },
  photos: { flexDirection: "row", justifyContent: "space-between" },
  photosFew: { justifyContent: "center", gap: 4 },
  photo: { width: (W - 8) / 3, height: ((W - 8) / 3) * (300 / 290), objectFit: "cover" },
  cap: { fontSize: 6.5, color: C.muted, marginTop: 5, marginBottom: 9 },
  mid: { flexDirection: "row", gap: 14 },
  kids: { width: W * 0.43, backgroundColor: C.panel, borderWidth: 0.75, borderColor: C.panelLine, borderRadius: 6, paddingTop: 22, paddingHorizontal: 6, paddingBottom: 8, alignItems: "center" },
  kidsRow: { flexDirection: "row", gap: 3 },
  kid: { width: (W * 0.43 - 12 - 6) / 3, height: (W * 0.43 - 12 - 6) / 3, objectFit: "cover" },
  kidsCap: { fontSize: 7.5, color: C.muted, marginTop: 16 },
  basics: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  basic: { width: "50%", paddingRight: 8, marginBottom: 4 },
  bl: { fontSize: 7, color: C.muted, marginBottom: 1 },
  bv: { fontSize: 8.5 },
  sec: { flexDirection: "row", alignItems: "flex-end", marginTop: 11, paddingBottom: 4, borderBottomWidth: 0.75, borderBottomColor: C.line },
  secH: { fontSize: 13, width: 200 },
  secS: { fontSize: 7, color: C.muted, marginBottom: 1.5 },
  card: { backgroundColor: C.panel, borderWidth: 0.75, borderColor: C.panelLine, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 14, marginTop: 9 },
  kv: { flexDirection: "row", marginVertical: 3.5 },
  kvL: { width: 105, fontSize: 8, color: C.muted },
  kvV: { flex: 1, fontSize: 9 },
  para: { fontSize: 9, lineHeight: 1.75, marginTop: 9 },
  carrier: { backgroundColor: C.warm, borderWidth: 0.75, borderColor: C.warmLine, borderRadius: 6, paddingVertical: 11, paddingHorizontal: 16, marginTop: 9 },
  carrierH: { fontSize: 13, marginBottom: 7 },
  cRow: { flexDirection: "row", paddingVertical: 4.5 },
  gene: { width: 150, fontSize: 9 },
  dis: { flex: 1, fontSize: 9 },
  en: { fontSize: 7.5, color: C.muted },
  note: { fontSize: 7, marginTop: 7 },
  hRow: { flexDirection: "row", marginTop: 8, paddingHorizontal: 8 },
  hL: { width: 100, fontSize: 9 },
  hV: { flex: 1, fontSize: 9, lineHeight: 1.5 },
  fam: { marginTop: 9 },
  fRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8 },
  fL: { width: 130, fontSize: 8 },
  fV: { flex: 1, fontSize: 8, lineHeight: 1.55 },
  risk: { fontSize: 8, lineHeight: 1.6, marginTop: 10 },
  src: { fontSize: 7, color: C.muted, lineHeight: 1.5, marginTop: 12 },
  empty: { fontSize: 8.5, color: C.muted, marginTop: 9 },
  // Variants for a page with more text than the template (ProfileModel.dense).
  photoD: { height: ((W - 8) / 3) * 0.82 },
  paraD: { fontSize: 8.5, lineHeight: 1.55, marginTop: 6 },
  cardD: { paddingVertical: 6, marginTop: 7 },
  kvD: { marginVertical: 2.5 },
  hRowD: { marginTop: 5 },
  fRowD: { paddingVertical: 4 },
  riskD: { lineHeight: 1.45, marginTop: 7 },
  srcD: { marginTop: 8 },
  // Page 2 with a long family history (dense level 2).
  secT: { marginTop: 7 },
  carrierT: { paddingVertical: 7, marginTop: 6 },
  cRowT: { paddingVertical: 2.5 },
  fRowT: { paddingVertical: 2 },
  fTextT: { fontSize: 7.5, lineHeight: 1.35 },
  foot: { position: "absolute", left: PX, right: PX, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.muted },
});

type TextStyle = ComponentProps<typeof View>["style"];
// Break CJK text only at the hair spaces breakable() inserts: a hyphenation break would draw a "-" mid-word.
const NO_HYPHEN = 10000;
const T = ({ style, children }: { style: TextStyle; children: string }) => (
  <Text style={style} hyphenationPenalty={NO_HYPHEN}>
    {breakable(children)}
  </Text>
);

/** Frames to draw: the photos there are (centred), or three empty frames when there are none. */
const slots = (n: number) => (n === 0 ? 3 : Math.min(n, 3));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function Photo({ images, id, style }: { images: ProfileImages; id?: string; style: ComponentProps<typeof View>["style"] & object }) {
  const b = id ? images.get(id) : null;
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images have no alt prop
  return b ? <Image style={style} src={{ data: b, format: "jpg" }} /> : <View style={[style, { backgroundColor: C.ph }]} />;
}

function Header({ m, title }: { m: ProfileModel; title: string }) {
  return (
    <>
      <View style={s.bar} fixed />
      <View style={s.top}>
        <Text style={s.brand}>Babiology Family</Text>
        <Text style={s.tag}>DONOR PROFILE / {m.donorNo}</Text>
      </View>
      <T style={s.h1}>{title}</T>
    </>
  );
}

function Section({ zh, en, tight }: { zh: string; en: string; tight?: boolean }) {
  return (
    <View style={[s.sec, tight ? s.secT : {}]} wrap={false}>
      <Text style={s.secH}>{zh}</Text>
      <Text style={s.secS}>{en}</Text>
    </View>
  );
}

function Footer({ m }: { m: ProfileModel }) {
  return (
    <View style={s.foot} fixed>
      <Text>Babiology Family</Text>
      <Text render={({ pageNumber, totalPages }) => `Donor ${m.donorNo} | ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function ProfileDoc({ m, images }: { m: ProfileModel; images: ProfileImages }) {
  const c = m.carriers;
  const d1 = m.dense.page1;
  const d2 = m.dense.page2 > 0;
  const t2 = m.dense.page2 > 1;
  return (
    <Document title={`Babiology Family | Donor ${m.donorNo}`} author="Babiology Family">
      <Page size="LETTER" style={s.page}>
        <Header m={m} title={`Donor ${m.donorNo}${m.title ? ` / ${m.title}` : ""}`} />
        <View style={slots(m.adultPhotos.length) < 3 ? [s.photos, s.photosFew] : s.photos}>
          {range(slots(m.adultPhotos.length)).map((i) => (
            <Photo key={i} images={images} id={m.adultPhotos[i]?.id} style={d1 ? { ...s.photo, ...s.photoD } : s.photo} />
          ))}
        </View>
        <Text style={s.cap}>成年照片</Text>
        <View style={s.mid} wrap={false}>
          <View style={s.kids}>
            <View style={s.kidsRow}>
              {range(slots(m.childPhotos.length)).map((i) => (
                <Photo key={i} images={images} id={m.childPhotos[i]?.id} style={s.kid} />
              ))}
            </View>
            <Text style={s.kidsCap}>童年照片</Text>
          </View>
          <View style={s.basics}>
            {m.basics.map((b) => (
              <View key={b.label} style={s.basic}>
                <Text style={s.bl}>{b.label}</Text>
                <T style={s.bv}>{b.value}</T>
              </View>
            ))}
          </View>
        </View>
        <Section zh="教育与职业" en="EDUCATION & WORK" />
        {m.education.length ? (
          <View style={[s.card, d1 ? s.cardD : {}]}>
            {m.education.map((e) => (
              <View key={e.label} style={[s.kv, d1 ? s.kvD : {}]}>
                <Text style={s.kvL}>{e.label}</Text>
                <T style={s.kvV}>{e.value}</T>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.empty}>暂无教育与职业信息。</Text>
        )}
        <Section zh="兴趣与个人亮点" en="INTERESTS & PERSONALITY" />
        {m.interests.length ? m.interests.map((p, i) => <T key={i} style={[s.para, d1 ? s.paraD : {}]}>{p}</T>) : <Text style={s.empty}>暂无。</Text>}
        <Footer m={m} />
      </Page>

      <Page size="LETTER" style={s.page}>
        <Header m={m} title="健康与遗传资料" />
        <Section zh="遗传携带筛查" en="GENETIC CARRIER SCREENING" tight={t2} />
        <View style={[s.carrier, t2 ? s.carrierT : {}]} wrap={false}>
          <T style={s.carrierH}>{c.heading}</T>
          {c.kind === "carrier"
            ? c.items.map((it) => (
                <View key={it.gene + it.variant} style={[s.cRow, t2 ? s.cRowT : {}]}>
                  <Text style={s.gene}>{it.gene}</Text>
                  <Text style={s.dis} hyphenationPenalty={NO_HYPHEN}>
                    {breakable(it.disease)}
                    {it.diseaseEn ? <Text style={s.en}>{breakable(`（${it.diseaseEn}）`)}</Text> : null}
                    {it.status ? <Text style={s.en}>{` · ${it.status}`}</Text> : null}
                  </Text>
                </View>
              ))
            : null}
          <T style={s.note}>{c.note}</T>
        </View>
        <Section zh="个人健康记录" en="PERSONAL HEALTH" tight={t2} />
        {m.personalHealth.length ? (
          m.personalHealth.map((h) => (
            <View key={h.label} style={[s.hRow, d2 ? s.hRowD : {}]} wrap={false}>
              <T style={s.hL}>{h.label}</T>
              <T style={s.hV}>{h.text}</T>
            </View>
          ))
        ) : (
          <Text style={s.empty}>暂无个人健康记录（病史报告尚未采集或解析）。</Text>
        )}
        <Section zh="家族病史摘要" en="FAMILY HISTORY" tight={t2} />
        {m.familyHistory.length ? (
          <View style={s.fam}>
            {m.familyHistory.map((f, i) => (
              <View key={i} style={[s.fRow, d2 ? s.fRowD : {}, t2 ? s.fRowT : {}, i % 2 === 0 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
                <T style={[s.fL, t2 ? s.fTextT : {}]}>{f.relation}</T>
                <T style={[s.fV, t2 ? s.fTextT : {}]}>{f.text}</T>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.empty}>暂无家族病史摘要。</Text>
        )}
        {m.riskAssessment.map((r, i) => (
          <T key={i} style={[s.risk, d2 ? s.riskD : {}]}>{`原报告评估：${r}`}</T>
        ))}
        <T style={[s.src, d2 ? s.srcD : {}]}>{m.sources}</T>
        <Footer m={m} />
      </Page>
    </Document>
  );
}

export async function renderProfilePdf(m: ProfileModel, images: ProfileImages): Promise<Buffer> {
  ensureFonts();
  return Buffer.from(await renderToBuffer(<ProfileDoc m={m} images={images} />));
}
