import type { ManualCarriers, RecordManual } from "@bb/db";
import type { Questionnaire } from "@/lib/donor-profile/questionnaire";
import type { ExportMedia } from "@/lib/export/types";
import type { FamilyRow, HealthRecord } from "@/lib/medical/parse";
import { zhEducation, zhFamily, zhHealth, zhInterests, zhRisk, type FamilyItem, type HealthItem, type QuestionnaireView, type Translate } from "./zh";

/**
 * Single-donor profile in the layout of docs/template/babiology_family_donor_*.pdf (page 1: photos, basics,
 * education, interests; page 2: carrier screening, personal health, family history). Everything here is display
 * text in Chinese; the HTML and PDF renderers only lay it out. Like the batch exports, the file never names the
 * source platform.
 */
export type ProfileModel = {
  donorNo: string;
  /** Chinese title line next to the donor number (translated profile title). */
  title: string;
  adultPhotos: ExportMedia[];
  childPhotos: ExportMedia[];
  basics: { label: string; value: string }[];
  education: { label: string; value: string }[];
  interests: string[];
  carriers: CarrierBlock;
  personalHealth: { label: string; text: string }[];
  familyHistory: { relation: string; text: string }[];
  riskAssessment: string[];
  /** "资料依据…" footnote. */
  sources: string;
  /** Tighter type/spacing for a page whose content would not fit one Letter page otherwise. */
  dense: { page1: boolean; /** 0 normal, 1 dense, 2 tight (long family history). */ page2: 0 | 1 | 2 };
};

/** Characters of body text each page holds at the template's spacing (measured on the 19161/22199 samples). */
const PAGE1_BUDGET = 420;
const PAGE2_BUDGET = 380;
const PAGE2_TIGHT = 600;
const chars = (xs: string[]) => xs.reduce((n, x) => n + x.length, 0);

export type CarrierBlock =
  | { kind: "carrier"; heading: string; items: { gene: string; disease: string; diseaseEn: string; result: string; variant: string; /** Qualifier of a non-plain result ("静默携带者"); empty for a plain carrier. */ status: string }[]; note: string }
  | { kind: "none"; heading: string; note: string }
  | { kind: "unknown"; heading: string; note: string };

type Data = Record<string, unknown>;
export type ProfileInput = {
  externalId: string;
  data: Data;
  /** Cached Chinese translation of `data` (may be partial / missing). */
  zh: Data | null;
  media: ExportMedia[];
  /** Hand-curated corrections from the record edit page; they win over the parsed values. */
  manual?: RecordManual | null;
};

const PHOTOS = 3;
const QUESTIONNAIRE_KEYS = ["degrees", "hsGpa", "occupation", "sportsPlayed", "mechanicalSkills"];

/** en → zh by position in two parallel lists (a dictionary-translated string[] field); unknown → English. */
function aligned(en: unknown, zh: unknown): Translate {
  const a = Array.isArray(en) ? (en as unknown[]) : [];
  const b = Array.isArray(zh) && zh.length === a.length ? (zh as unknown[]) : [];
  const m = new Map(a.map((x, i) => [String(x), typeof b[i] === "string" && b[i] ? String(b[i]) : String(x)]));
  return (s) => m.get(s) ?? s;
}

/** Rows of the earlier model-written summaries ({label|relation, text}). */
function legacyItems<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string") as T[]) : [];
}
const CN_NUM = ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"];
export const cnCount = (n: number) => (n >= 0 && n <= 10 ? CN_NUM[n] : String(n));

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? [str(v)] : []);

/** 6'0" (183cm) → 6英尺 / 182.9 cm; 6'1" → 6英尺1英寸 / 185.4 cm (呎 is outside the PDF font's GB2312 subset). Falls back to the raw text. */
export function formatHeight(raw: string): string {
  const m = raw.match(/(\d)\s*['’]\s*(\d{1,2})?/);
  if (!m) return raw;
  const ft = Number(m[1]);
  const inch = Number(m[2] ?? 0);
  const cm = (ft * 12 + inch) * 2.54;
  return `${ft}英尺${inch ? `${inch}英寸` : ""} / ${cm.toFixed(1)} cm`;
}

/** 175 lbs (79kg) → 175 lb / 约79 kg. */
export function formatWeight(raw: string): string {
  const lb = raw.match(/(\d{2,3}(?:\.\d)?)\s*lbs?/i);
  if (!lb) return raw;
  const kg = raw.match(/\((\d{2,3}(?:\.\d)?)\s*kg\)/i)?.[1] ?? String(Math.round(Number(lb[1]) * 0.4536));
  return `${lb[1]} lb / 约${kg} kg`;
}

/** A+ → A型 Rh阳性（A+）. */
export function formatBloodType(raw: string): string {
  const m = raw.trim().match(/^(AB|A|B|O)\s*([+-]|pos(?:itive)?|neg(?:ative)?)$/i);
  if (!m) return raw;
  const pos = /^[+p]/i.test(m[2]);
  const t = m[1].toUpperCase();
  return `${t}型 Rh${pos ? "阳性" : "阴性"}（${t}${pos ? "+" : "-"}）`;
}

/** 棕色 + 黑色 + 直发 → 棕眼 / 黑色直发. */
export function formatEyesHair(eye: string, hair: string, texture: string): string {
  const e = eye ? `${eye.replace(/色$/, "")}眼` : "";
  const h = `${hair}${texture}`;
  return [e, h].filter(Boolean).join(" / ");
}

const isoToCn = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : iso;
};

/** Result as printed (cryobank "SILENT CARRIER", Fairfax "Possible Carrier") → qualifier shown next to the disease. */
export function carrierStatus(result: string): string {
  if (/silent/i.test(result)) return "静默携带者";
  if (/possible/i.test(result)) return "可能携带者";
  if (/increased/i.test(result)) return "携带风险升高";
  return "";
}

/** Source names must never reach an exported profile (exports do not reveal where a record came from). */
const SOURCE_NAMES = /\b(?:Fairfax(?:\s+Cryobank)?|California\s+Cryobank|cryobank\.com|CCB)\b\s*/gi;
export const scrubSource = (s: string) => s.replace(SOURCE_NAMES, "").replace(/\s{2,}/g, " ").trim();

/** Identity-release badge → Chinese ("Fairfax ID Reserve – 10 families" → 开放身份（ID，限10个家庭）). */
export function idReleaseText(badges: string[]): string | undefined {
  // "Non-ID" contains "ID": anonymous donors must not read as identity-release ones (Fairfax category badges).
  const anonymous = (b: string) => /\bnon[-\s]?id\b|anonymous/i.test(b);
  const id = badges.find((b) => /\bID\b|identity/i.test(b) && !anonymous(b));
  if (id) {
    const families = id.match(/(\d+)\s*famil/i)?.[1];
    return `开放身份（ID${families ? `，限${families}个家庭` : ""}）`;
  }
  return badges.some(anonymous) ? "否（匿名）" : undefined;
}

/** BMI from "6'4\" (193cm)" and "195 lbs (88kg)" when the source does not state it. */
export function bmiOf(height: string, weight: string): string {
  const ft = height.match(/(\d)\s*['’]\s*(\d{1,2})?/);
  const cm = height.match(/(\d{3}(?:\.\d)?)\s*cm/i)?.[1];
  const m = cm ? Number(cm) / 100 : ft ? ((Number(ft[1]) * 12 + Number(ft[2] ?? 0)) * 2.54) / 100 : 0;
  const lb = weight.match(/(\d{2,3}(?:\.\d)?)\s*lbs?/i)?.[1];
  const kg = Number(weight.match(/(\d{2,3}(?:\.\d)?)\s*kg/i)?.[1] ?? (lb ? Number(lb) * 0.4536 : 0));
  return m > 1.2 && kg > 30 ? (kg / (m * m)).toFixed(1) : "";
}

const NOTHING_REPORTED = "未报告显著疾病。";
/**
 * Relatives with nothing reported become one summary line, as in the template ("父亲及母亲均未报告显著疾病"), so the
 * page shows the relatives that matter instead of twenty identical rows. Kept as is with fewer than three such rows.
 */
export function summarizeFamily(items: FamilyItem[]): FamilyItem[] {
  const quiet = items.filter((f) => f.text === NOTHING_REPORTED);
  if (quiet.length < 3) return items;
  const counts = new Map<string, number>();
  for (const f of quiet) {
    const r = f.relation.replace(/[（(].*$/, "").trim();
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const names = [...counts].map(([r, n]) => (n > 1 ? `${r}（${n}人）` : r));
  const rest = items.filter((f) => f.text !== NOTHING_REPORTED);
  return [{ relation: rest.length ? "其他亲属" : "家族成员", text: `${names.join("、")}均未报告显著疾病。` }, ...rest];
}

/** The edit page's carrier screening, worded like the parsed block. */
function manualCarrierBlock(m: ManualCarriers): CarrierBlock {
  const panel = scrubSource(m.panel);
  if (m.kind === "none" || !m.items.length) return { kind: "none", heading: "未检出携带者", note: `检测项目：${panel || "基因携带者筛查"}。` };
  const items = m.items
    .map((it) => ({ gene: it.gene.trim(), disease: it.disease.trim(), diseaseEn: (it.diseaseEn ?? "").trim(), result: "", variant: "", status: (it.status ?? "").trim() }))
    .sort((a, b) => a.gene.localeCompare(b.gene));
  return { kind: "carrier", heading: `携带者阳性 · ${cnCount(items.length)}项结果`, items, note: `结果来源：${panel || "基因携带者筛查报告"}（结果摘要）。` };
}

/** Whether the record's carrier screening needs the edit page: a report exists but its result was not extracted. */
export function needsManualCarriers(data: Data, manual?: RecordManual | null): boolean {
  const hasReport = !!str(data.gtsPanel) || (Array.isArray(data.geneticTests) && data.geneticTests.length > 0);
  return hasReport && !manual?.carriers && !Array.isArray(data.gtsCarriers);
}

function carrierBlock(data: Data, zh: Data | null): CarrierBlock {
  const carriers = data.gtsCarriers;
  const panel = scrubSource(str(data.gtsPanel));
  if (Array.isArray(carriers)) {
    if (carriers.length === 0) return { kind: "none", heading: "未检出携带者", note: `检测项目：${panel || "基因携带者筛查"}。` };
    const en = list(data.gtsCarrierDiseases);
    const cn = list(zh?.gtsCarrierDiseases);
    const items = carriers.map((c, i) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const diseaseEn = str(o.disease) || en[i] || "";
      const disease = cn.length === carriers.length && cn[i] ? cn[i] : diseaseEn;
      return { gene: str(o.gene), disease, diseaseEn: disease === diseaseEn ? "" : diseaseEn, result: str(o.result), variant: str(o.variant), status: carrierStatus(`${str(o.result)} ${str(o.variant)}`) };
    });
    items.sort((a, b) => a.gene.localeCompare(b.gene));
    return { kind: "carrier", heading: `携带者阳性 · ${cnCount(items.length)}项结果`, items, note: `结果来源：${panel || "基因携带者筛查报告"}（结果摘要）。` };
  }
  if (panel) return { kind: "unknown", heading: "筛查结果待人工整理", note: `报告为 ${panel}，暂不支持自动提取，请查看原始报告。` };
  return { kind: "unknown", heading: "暂无基因筛查数据", note: "尚未采集到基因携带者筛查报告。" };
}

export function buildProfileModel(input: ProfileInput): ProfileModel {
  const { data, zh } = input;
  const t = (k: string) => str(zh?.[k]) || str(data[k]);
  const tl = (k: string) => (list(zh?.[k]).length ? list(zh?.[k]) : list(data[k]));
  const byField = (field: string) =>
    input.media
      .filter((m) => m.fieldKey === field && (m.kind === "photo" || m.kind === "screenshot"))
      .sort((a, b) => a.position - b.position)
      .slice(0, PHOTOS);

  const idRelease = idReleaseText(list(data.badges));
  const birthYear = str(data.birthYear);
  // Without a birth year (Fairfax), the age range at donation is the closest fact.
  const age = str(data.ageRangeAtDonation).replace(/\s*[-–]\s*/, "–");
  const basics = [
    !birthYear && age ? { label: "捐献时年龄", value: `${age}岁` } : { label: "出生年份", value: birthYear ? `${birthYear}年` : "" },
    { label: "身高", value: str(data.height) ? formatHeight(str(data.height)) : "" },
    { label: "体重", value: str(data.weight) ? formatWeight(str(data.weight)) : "" },
    { label: "BMI", value: str(data.bmi) || bmiOf(str(data.height), str(data.weight)) },
    { label: "眼睛 / 头发", value: formatEyesHair(t("eyeColor"), t("hairColor"), t("hairTexture")) },
    { label: "血型", value: str(data.bloodType) ? formatBloodType(str(data.bloodType)) : "" },
    { label: "祖源", value: tl("ancestry").join("、") },
    { label: "宗教", value: t("religion") },
    { label: "身份开放", value: idRelease ?? "未确认" },
    { label: "CMV抗体", value: t("cmvStatus") },
  ].map((b) => ({ ...b, value: b.value || "未提供" }));

  // Questionnaire (extended profile) answers, when captured; otherwise only the site's education fields are known.
  // `occupation` alone is also a site field (Fairfax): it does not mean a questionnaire was parsed.
  const q = (QUESTIONNAIRE_KEYS.some((k) => k !== "occupation" && k in data) ? data : null) as QuestionnaireView | null;
  const tq = (k: keyof Questionnaire) => t(k);
  const siteDegree = [t("educationLevel"), t("areaOfStudy")].filter(Boolean).join("；");
  const education = (
    q
      ? zhEducation(q, tq, t("educationLevel"))
      : [
          { label: "学历 / 专业", value: siteDegree },
          { label: "职业", value: t("occupation") },
          { label: "喜爱的科目", value: tl("favoriteSubject").join("、") },
          { label: "兴趣 / 运动", value: (tl("interests").length ? tl("interests") : tl("hobbies")).join("、") },
          { label: "人生目标", value: tl("personalGoals").join("、") },
        ]
  ).filter((e) => e.value);

  const about = t("about")
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const interests = [...about, ...(q ? zhInterests(q, tq) : [])].map(scrubSource);

  // Medical Profile: parsed fields worded by rules (zh.ts); dictionary translations of the leftover clauses and the
  // diagnosis names are looked up position by position. Records parsed by the earlier model summary keep theirs.
  const phrase = aligned(data.medicalPhrases, zh?.medicalPhrases);
  const diagnosis = aligned(data.familyDiagnoses, zh?.familyDiagnoses);
  const healthRecord = data.healthRecord && typeof data.healthRecord === "object" ? (data.healthRecord as HealthRecord) : null;
  const familyTable = Array.isArray(data.familyTable) ? (data.familyTable as FamilyRow[]) : null;
  const personalHealth = healthRecord ? zhHealth(healthRecord, phrase) : legacyItems<HealthItem>(data.personalHealth);
  const familyHistory = summarizeFamily(familyTable ? zhFamily(familyTable, diagnosis, phrase) : legacyItems<FamilyItem>(data.familyHistory));
  const riskAssessment = Array.isArray(data.riskTopics) ? zhRisk(tl("riskTopics")) : list(data.riskAssessment);

  const consult = str(data.medicalConsultDate);
  const carriers = input.manual?.carriers ? manualCarrierBlock(input.manual.carriers) : carrierBlock(data, zh);
  const sourceParts = [
    q ? "捐献者详细资料问卷" : "",
    consult ? `健康与家族史问询（${isoToCn(consult)}）` : "",
    str(data.gtsPanel) || Array.isArray(data.gtsCarriers) || input.manual?.carriers ? `遗传携带筛查结果摘要${str(data.geneticUpdated) ? `（更新于 ${str(data.geneticUpdated)}）` : ""}` : "",
  ].filter(Boolean);

  const dense = {
    page1: chars([...interests, ...education.map((e) => e.value)]) > PAGE1_BUDGET,
    page2: ((load) => (load > PAGE2_TIGHT ? 2 : load > PAGE2_BUDGET ? 1 : 0))(
      chars([...personalHealth.map((h) => h.text), ...familyHistory.map((f) => f.relation + f.text), ...riskAssessment]) + 24 * familyHistory.length,
    ) as 0 | 1 | 2,
  };

  return {
    donorNo: input.externalId,
    // A short tagline after the donor number; sources without a profile title fall back to the occupation.
    title: scrubSource(t("title") || t("occupation")),
    adultPhotos: byField("adulthoodPhotos"),
    childPhotos: byField("childhoodPhotos"),
    basics,
    education,
    interests,
    carriers,
    personalHealth,
    familyHistory,
    riskAssessment,
    dense,
    sources: `${sourceParts.length ? `资料依据：${sourceParts.join("、")}。` : ""}此页为重点摘要，完整记录请结合原始档案查看。`,
  };
}
