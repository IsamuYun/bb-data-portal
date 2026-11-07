import type { Questionnaire } from "@/lib/donor-profile/questionnaire";
import type { FamilyRow, HealthRecord } from "@/lib/medical/parse";

/**
 * Chinese wording for the parsed Medical Profile and questionnaire, by rules instead of a model. The forms use a
 * small, repetitive vocabulary ("Diagnosed in his 60s; treatment unknown; no known contributing factors."), so most
 * clauses are translated here. Clauses no rule covers are collected (`medicalLeftovers`) into the `medicalPhrases`
 * field, which the dictionary translates (and learns, so each phrase is paid for at most once).
 */

export type Translate = (en: string) => string;

/** Drop trailing sentence punctuation so pieces can be joined with "；" and closed with one "。". */
export const tidy = (s: string) => s.trim().replace(/[\s。.;；!！,，、:：]+$/u, "");

// ---------------------------------------------------------------------------------------------------------------
// Medical clauses

const decade = (n: string) => `${n}多岁`;
const ageRange = (s: string) => s.replace(/^(\d0)-(\d0)$/, "$1至$2").replace(/^(\d0)$/, "$1");
const ERA: Record<string, string> = { childhood: "童年时", adolescence: "青少年时期", adulthood: "成年后", infancy: "婴儿期", "early childhood": "幼年时" };
const CAUSE: Record<string, string> = {
  age: "年龄",
  smoking: "吸烟",
  alcohol: "饮酒",
  alcoholism: "酗酒",
  "alcoholism and smoking": "酗酒和吸烟",
  diet: "饮食",
  "poor diet": "饮食不良",
  obesity: "肥胖",
  diabetes: "糖尿病",
  genetics: "遗传因素",
  "family history": "家族史",
  "covid-19 infection": "新冠感染",
  stress: "压力",
  "lifestyle factors": "生活方式",
};
const TREATMENT: Record<string, string> = {
  medication: "药物治疗",
  "prescription medication": "处方药治疗",
  "over the counter medication": "非处方药治疗",
  "over the counter medication as needed": "按需使用非处方药",
  "medication as needed": "按需用药",
  surgery: "手术治疗",
  "surgery and chemotherapy": "手术及化疗",
  "surgery, chemotherapy, and radiation": "手术、化疗及放疗",
  "chemotherapy and radiation": "化疗及放疗",
  chemotherapy: "化疗",
  radiation: "放疗",
  mastectomy: "乳房切除术",
  insulin: "胰岛素治疗",
  therapy: "心理治疗",
  counseling: "心理咨询",
  "therapy and medication": "心理治疗及药物治疗",
  "supportive care": "支持性治疗",
  hospitalization: "住院治疗",
  "physical therapy": "物理治疗",
  "lifestyle changes": "调整生活方式",
  "diet and exercise": "饮食与运动调节",
  "hearing aids": "佩戴助听器",
  glasses: "佩戴眼镜",
  "an inhaler": "吸入剂治疗",
  inhaler: "吸入剂治疗",
};

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^none$/, () => "无"],
  [/^(not treated|no treatment|untreated|treatment none|no treatment needed|no treatment required)$/, () => "未治疗"],
  [/^refused treatment$/, () => "拒绝治疗"],
  [/^(treatment unknown|unknown treatment|treatment is unknown)$/, () => "治疗情况不详"],
  [/^treated$/, () => "已治疗"],
  [/^treat(?:ed|s) with (.+)$/, (m) => TREATMENT[m[1]] ?? ""],
  [/^no known contributing factors?$/, () => "无已知诱因"],
  [/^(contributing factors unknown|unknown contributing factors|contributing factors are unknown)$/, () => "诱因不详"],
  [/^contributing factors? (may )?(?:have )?(?:include[sd]?|(?:may )?be|was|were) (.+)$/, (m) => (CAUSE[m[2]] ? `诱因${m[1] ? "可能" : ""}包括${CAUSE[m[2]]}` : "")],
  [/^contributing factors? (.+)$/, (m) => (CAUSE[m[1]] ? `诱因为${CAUSE[m[1]]}` : "")],
  [/^no known prior medical conditions$/, () => "无已知既往病史"],
  [/^(cause unknown|cause of death unknown|unknown cause|cause of death is unknown)$/, () => "死因不详"],
  [/^diagnosed (?:in (?:his|her|their) )?(?:early |mid-?|late )?(\d0)s$/, (m) => `${decade(m[1])}确诊`],
  [/^diagnosed (?:in (?:his|her|their) )?(\d0-\d0)s$/, (m) => `${ageRange(m[1])}多岁确诊`],
  [/^diagnosed at (?:about |around |approximately |roughly )?age (\d+)$/, (m) => `${/about|around|approx|roughly/.test(m[0]) ? "约" : ""}${m[1]}岁确诊`],
  [/^diagnosed at age (\d+) or (\d+)$/, (m) => `${m[1]}或${m[2]}岁确诊`],
  [/^diagnosed (?:at )?(?:an )?unknown age$/, () => "确诊年龄不详"],
  [/^diagnosed at birth$/, () => "出生时确诊"],
  [/^diagnosed at or (?:soon )?after birth$/, () => "出生时或出生后不久确诊"],
  [/^diagnosed (?:in|during) (childhood|adolescence|adulthood|infancy|early childhood)$/, (m) => `${ERA[m[1]]}确诊`],
  [/^diagnosed between (\d+)-(\d+) years old$/, (m) => `${m[1]}至${m[2]}岁确诊`],
  [/^diagnosed (\d+)-(\d+) years old$/, (m) => `${m[1]}至${m[2]}岁确诊`],
  [/^diagnosed and fatal in (?:his|her|their) (\d0)s$/, (m) => `${decade(m[1])}确诊并因此去世`],
  [/^diagnosed and fatal at age (\d+)$/, (m) => `${m[1]}岁确诊并因此去世`],
  [/^onset (?:at|in) (?:about |around )?age (\d+)$/, (m) => `${/about|around/.test(m[0]) ? "约" : ""}${m[1]}岁发病`],
  [/^onset in (?:his|her|their) (\d0)s$/, (m) => `${decade(m[1])}发病`],
  [/^died (?:in (?:his|her|their) )?(\d0(?:-\d0)?)s$/, (m) => `${ageRange(m[1])}多岁去世`],
  [/^died at (?:about )?age (\d+)$/, (m) => `${m[1]}岁去世`],
  [/^died (?:in (?:his|her|their) )?(\d0)s (?:due to|of) (?:an )?unknown (?:cause|causes)$/, (m) => `${decade(m[1])}去世，死因不详`],
  [/^died at age (\d+) (?:due to|of) (?:an )?unknown (?:cause|causes)$/, (m) => `${m[1]}岁去世，死因不详`],
  [/^died due to natural causes at age (\d+)$/, (m) => `${m[1]}岁自然死亡`],
  [/^specific cause of death is unknown$/, () => "具体死因不详"],
  [/^complications fatal at age (\d+)$/, (m) => `${m[1]}岁时因并发症去世`],
  [/^onset was (?:about |around )?age (\d+)$/, (m) => `${/about|around/.test(m[0]) ? "约" : ""}${m[1]}岁发病`],
  [/^diagnosed in (childhood|adolescence|adulthood), specific age is unknown$/, (m) => `${ERA[m[1]]}确诊，具体年龄不详`],
  [/^died due to natural causes at age (\d+), specific cause of death is unknown$/, (m) => `${m[1]}岁自然死亡，具体死因不详`],
  [/^died in a (?:motor vehicle|car) accident (?:in (?:his|her|their) (\d0)s|at age (\d+))$/, (m) => `${m[1] ? decade(m[1]) : `${m[2]}岁`}时死于交通事故`],
  [/^(?:he|she|they) (?:is|are) believed to be alive$/, () => "据信仍在世"],
  [/^treated, but details are unknown(?: to the donor)?$/, () => "接受过治疗，详情不详"],
  [/^resolved within (?:about )?(\d+) (year|month|week)s?$/, (m) => `约${m[1]}${{ year: "年", month: "个月", week: "周" }[m[2]]}内痊愈`],
  [/^resolved (?:by|in) (?:the )?end of (childhood|adolescence)$/, (m) => `${m[1] === "childhood" ? "童年" : "青春期"}结束前痊愈`],
  [/^resolved in (childhood|adolescence)$/, (m) => `${m[1] === "childhood" ? "童年" : "青春期"}时痊愈`],
  [/^(?:resolved|now resolved|symptoms resolved)$/, () => "已痊愈"],
  [/^no recurrences?$/, () => "无复发"],
  [/^no symptoms since$/, () => "此后无症状"],
  [/^no long-term issues$/, () => "无长期影响"],
  [/^(?:well[- ]controlled|controlled with medication)$/, () => "控制良好"],
  [/^(?:ongoing|currently ongoing)$/, () => "目前仍在持续"],
  [/^(?:currently healthy|healthy)$/, () => "目前健康"],
];

/** Chinese for one clause, or null when no rule covers it. */
export function zhClause(en: string): string | null {
  const s = en
    .trim()
    .replace(/[.;,]+$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!s) return "";
  for (const [re, fn] of RULES) {
    const m = s.match(re);
    if (m) {
      const out = fn(m);
      if (out) return out;
    }
  }
  return null;
}

/** "a; b. C" → ["a", "b", "C"] (semicolons and sentence ends). */
export function splitClauses(text: string): string[] {
  return text
    .split(/;\s*|\.\s+(?=[A-Z])/)
    .map((c) => c.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

/** Translate free medical text clause by clause; `phrase` covers what the rules do not. */
export function zhMedicalText(text: string, phrase: Translate): string {
  const parts = splitClauses(text).map((c) => tidy(zhClause(c) ?? phrase(c)));
  return parts.filter(Boolean).join("；");
}

// ---------------------------------------------------------------------------------------------------------------
// Relatives

const RELATIVE: [RegExp, string][] = [
  [/^DONOR$/, "本人"],
  [/^MOTHER$/, "母亲"],
  [/^FATHER$/, "父亲"],
  [/^(?:FULL )?SISTERS?$/, "姐妹"],
  [/^(?:FULL )?BROTHERS?$/, "兄弟"],
  [/^MATERNAL HALF[- ]SISTERS?$/, "同母异父姐妹"],
  [/^PATERNAL HALF[- ]SISTERS?$/, "同父异母姐妹"],
  [/^MATERNAL HALF[- ]BROTHERS?$/, "同母异父兄弟"],
  [/^PATERNAL HALF[- ]BROTHERS?$/, "同父异母兄弟"],
  [/^HALF[- ]SISTERS?$/, "同父异母或同母异父姐妹"],
  [/^HALF[- ]BROTHERS?$/, "同父异母或同母异父兄弟"],
  [/^SONS?$/, "儿子"],
  [/^DAUGHTERS?$/, "女儿"],
  [/^CHILDREN$/, "子女"],
  [/^NIECES?$/, "侄女/外甥女"],
  [/^NEPHEWS?$/, "侄子/外甥"],
  [/^MATERNAL GRANDMOTHER$/, "外祖母"],
  [/^MATERNAL GRANDFATHER$/, "外祖父"],
  [/^PATERNAL GRANDMOTHER$/, "祖母"],
  [/^PATERNAL GRANDFATHER$/, "祖父"],
  [/^MATERNAL GREAT[- ]GRANDMOTHER$/, "外曾祖母"],
  [/^MATERNAL GREAT[- ]GRANDFATHER$/, "外曾祖父"],
  [/^PATERNAL GREAT[- ]GRANDMOTHER$/, "曾祖母"],
  [/^PATERNAL GREAT[- ]GRANDFATHER$/, "曾祖父"],
  [/^MATERNAL AUNTS?$/, "姨母"],
  [/^MATERNAL UNCLES?$/, "舅舅"],
  [/^PATERNAL AUNTS?$/, "姑母"],
  [/^PATERNAL UNCLES?$/, "叔伯"],
  [/^(MATERNAL|PATERNAL) (MALE|FEMALE)? ?(?:FIRST[- ])?COUSINS?$/, ""],
  [/^(MATERNAL|PATERNAL) (?:FIRST[- ])?COUSINS?$/, ""],
];

/** "PATERNAL MALE COUSIN (B. 1994)" → 父系男性表亲（1994年出生）; unknown wording stays English. */
export function zhRelation(en: string): string {
  const m = en.trim().match(/^(.*?)\s*(?:\(([^)]*)\))?$/);
  const base = (m?.[1] ?? en).toUpperCase().replace(/\s+/g, " ");
  const note = m?.[2]?.trim() ?? "";
  let zh = en.trim();
  for (const [re, out] of RELATIVE) {
    const r = base.match(re);
    if (!r) continue;
    if (out) zh = out;
    else {
      const side = /MATERNAL/.test(base) ? "母系" : "父系";
      const sex = /FEMALE/.test(base) ? "女性" : /MALE/.test(base) ? "男性" : "";
      zh = `${side}${sex}表亲`;
    }
    break;
  }
  if (zh === en.trim()) return zh;
  const n =
    note.match(/^b\.?\s*(\d{4})$/i)?.[1] ? `${note.match(/(\d{4})/)![1]}年出生`
    : note.match(/^d\.?\s*(\d+)s$/i) ? `${note.match(/(\d+)/)![1]}多岁去世`
    : note.match(/^d\.?\s*(\d+)$/i) ? `${note.match(/(\d+)/)![1]}岁去世`
    : note.match(/^age\s*(\d+)$/i) ? `${note.match(/(\d+)/)![1]}岁`
    : note;
  return n ? `${zh}（${n}）` : zh;
}

// ---------------------------------------------------------------------------------------------------------------
// Medical summary rows

const YES = /^yes\b/i;
const NO = /^no\b/i;

export type HealthItem = { label: string; text: string };
export type FamilyItem = { relation: string; text: string };

export function zhHealth(h: HealthRecord, phrase: Translate): HealthItem[] {
  const out: HealthItem[] = [];
  if (h.surgery) {
    if (NO.test(h.surgery)) out.push({ label: "手术记录", text: "无手术史。" });
    else {
      const bits = [h.procedures ? zhMedicalText(h.procedures, phrase) : "有手术史"];
      if (h.anesthesia && YES.test(h.anesthesia)) bits.push("曾使用全身麻醉");
      if (h.anesthesiaComplications && /^none\b/i.test(h.anesthesiaComplications)) bits.push("无麻醉相关并发症");
      else if (h.anesthesiaComplications) bits.push(`麻醉并发症：${zhMedicalText(h.anesthesiaComplications, phrase)}`);
      out.push({ label: "手术记录", text: `${bits.join("；")}。` });
    }
  }
  if (h.allergies) out.push({ label: "过敏记录", text: NO.test(h.allergies) ? "无过敏史。" : `${zhMedicalText(h.allergyDetails ?? "有过敏史", phrase)}。` });
  if (h.foodIntolerance) out.push({ label: "食物不耐受", text: NO.test(h.foodIntolerance) ? "无食物不耐受。" : `${zhMedicalText(h.foodDetails ?? "有食物不耐受", phrase)}。` });
  return out;
}

const NO_DIAGNOSIS = /^(none|no known (health )?(issues|conditions))$/i;
const DECEASED = /^deceased$/i;

/** One line per relative: "60多岁确诊2型糖尿病（治疗情况不详）；…；70至80多岁去世，死因不详。" */
export function zhFamily(rows: FamilyRow[], diagnosis: Translate, phrase: Translate): FamilyItem[] {
  const byRelative = new Map<string, FamilyRow[]>();
  for (const r of rows) byRelative.set(r.relation, [...(byRelative.get(r.relation) ?? []), r]);
  return [...byRelative.entries()].map(([relation, rs]) => {
    const parts = rs.map((r) => {
      if (NO_DIAGNOSIS.test(r.diagnosis.trim()) && !r.details) return "未报告显著疾病";
      const details = r.details ? zhMedicalText(r.details, phrase) : "";
      if (DECEASED.test(r.diagnosis.trim()) || !r.diagnosis) return details || "已故";
      const name = diagnosis(r.diagnosis);
      return details ? `${name}：${details}` : name;
    });
    return { relation: zhRelation(relation), text: `${parts.join("；")}。` };
  });
}

export function zhRisk(topics: string[]): string[] {
  if (!topics.length) return ["未发现高于一般人群的特定风险。"];
  return [`子代在以下方面的风险可能高于一般人群：${topics.join("；")}（具体风险无法准确量化）。`];
}

/** Clauses of the medical texts that no rule covers, in first-seen order (the `medicalPhrases` field). */
export function medicalLeftovers(h: HealthRecord | null, rows: FamilyRow[]): string[] {
  const out: string[] = [];
  const add = (text: string | null | undefined) => {
    if (!text) return;
    for (const c of splitClauses(text)) if (zhClause(c) === null && !out.includes(c)) out.push(c);
  };
  if (h) {
    if (h.surgery && !NO.test(h.surgery)) add(h.procedures);
    if (h.anesthesiaComplications && !/^none\b/i.test(h.anesthesiaComplications)) add(h.anesthesiaComplications);
    if (h.allergies && !NO.test(h.allergies)) add(h.allergyDetails);
    if (h.foodIntolerance && !NO.test(h.foodIntolerance)) add(h.foodDetails);
  }
  for (const r of rows) add(r.details);
  return out;
}

/** Diagnosis names to translate (the `familyDiagnoses` field); "None" / "Deceased" are worded by the rules. */
export function familyDiagnosisNames(rows: FamilyRow[]): string[] {
  return [...new Set(rows.map((r) => r.diagnosis.trim()).filter((d) => d && !NO_DIAGNOSIS.test(d) && !DECEASED.test(d)))];
}

// ---------------------------------------------------------------------------------------------------------------
// Questionnaire

const DEGREE: Record<string, string> = {
  "B.A.": "文学学士（B.A.）",
  "B.S.": "理学学士（B.S.）",
  "M.A.": "文学硕士（M.A.）",
  "M.S.": "理学硕士（M.S.）",
  "Ph.D.": "博士（Ph.D.）",
  "M.D.": "医学博士（M.D.）",
  "J.D.": "法律博士（J.D.）",
  "D.D.S.": "牙医博士（D.D.S.）",
};
const DEGREE_RANK = ["M.D.", "Ph.D.", "J.D.", "D.D.S.", "M.S.", "M.A.", "B.S.", "B.A."];
export const MECHANICAL: Record<string, string> = {
  "I can barely replace a light bulb": "动手能力一般",
  "Auto repair": "汽车维修",
  Carpentry: "木工",
  Plumbing: "水管维修",
  "Model building": "模型制作",
  "Building computers": "组装电脑",
  Electrical: "电工",
  "I can fix ANYTHING": "动手能力很强",
};
export const MATH: Record<string, string> = { Basic: "基础", Good: "良好", Excellent: "优秀（微积分水平）", Einstein: "顶尖（线性代数、高等统计水平）" };
export const ATHLETIC: Record<string, string> = {
  "I can walk and chew gum at the same time": "运动一般",
  Yes: "有运动基础（高中/俱乐部运动）",
  Very: "运动能力很强（高中队长/明星球员/州级荣誉）",
  Extremely: "运动能力出众（大学/职业运动员）",
};
export const SPORTS: Record<string, string> = {
  "Baseball / Softball": "棒球/垒球",
  Basketball: "篮球",
  Golf: "高尔夫",
  Football: "橄榄球",
  Soccer: "足球",
  Swimming: "游泳",
  Running: "跑步",
  "Weight Training": "力量训练",
  Hockey: "冰球",
  Triathlons: "铁人三项",
  Tennis: "网球",
  Racquetball: "壁球",
  Volleyball: "排球",
  Skiing: "滑雪",
  "Snow Boarding": "单板滑雪",
  Surfing: "冲浪",
  "Skate Boarding": "滑板",
  Wrestling: "摔跤",
  "Ping Pong": "乒乓球",
};
export const LANGUAGES: Record<string, string> = {
  English: "英语",
  Arabic: "阿拉伯语",
  Farsi: "波斯语",
  French: "法语",
  German: "德语",
  Greek: "希腊语",
  Hebrew: "希伯来语",
  Hindi: "印地语",
  Italian: "意大利语",
  Japanese: "日语",
  Korean: "韩语",
  Mandarin: "中文（普通话）",
  Portuguese: "葡萄牙语",
  Polish: "波兰语",
  Russian: "俄语",
  Spanish: "西班牙语",
  Tagalog: "他加禄语",
  Vietnamese: "越南语",
};
const map = (table: Record<string, string>, xs: string[]) => xs.map((x) => table[x] ?? x);
const NONE = /^(none|n\/a|no)\.?$/i;

/** Questionnaire answers with free text already in Chinese where a translation exists (`t` falls back to English). */
export type QuestionnaireView = Partial<Questionnaire>;

export function zhEducation(q: QuestionnaireView, raw: (k: keyof Questionnaire) => string, fallbackDegree: string): { label: string; value: string }[] {
  const t = (k: keyof Questionnaire) => tidy(raw(k));
  const degrees = [...(q.degrees ?? [])].sort((a, b) => DEGREE_RANK.indexOf(a) - DEGREE_RANK.indexOf(b));
  const degreeText = degrees.length ? map(DEGREE, degrees).join("、") : fallbackDegree;
  const study = [
    degreeText,
    t("majors") && `专业：${t("majors")}`,
    t("gradFocus") && `研究生方向：${t("gradFocus")}`,
    t("otherDegrees") && t("otherDegrees"),
  ].filter(Boolean);
  const occupation = [
    q.fullTimeStudent === "Yes" ? "全日制学生" : t("occupation"),
    t("pastJobs") && t("pastJobs") !== t("occupation") && `曾任：${t("pastJobs")}`,
    q.military === "Yes" && "有服役经历",
  ].filter(Boolean);
  const grades = [
    q.hsGpa && `高中GPA ${q.hsGpa}`,
    q.collegeGpa && `大学GPA ${q.collegeGpa}`,
    q.gradGpa && `研究生GPA ${q.gradGpa}`,
    q.honors && !NONE.test(q.honors) && `荣誉：${t("honors")}`,
    q.academicAwards && !NONE.test(q.academicAwards) && t("academicAwards"),
  ].filter(Boolean);
  const skills = [
    [...map(MECHANICAL, q.mechanicalSkills ?? []), t("mechanicalOther")].filter(Boolean).join("、"),
    q.mathSkills && `数学${MATH[q.mathSkills] ?? q.mathSkills}`,
    q.languages?.length && `语言：${[...map(LANGUAGES, q.languages), t("languagesOther")].filter(Boolean).join("、")}`,
    (q.sportsPlayed?.length || q.sportsOther) && `运动：${[...map(SPORTS, (q.sportsPlayed ?? []).slice(0, 6)), t("sportsOther")].filter(Boolean).join("、")}`,
    q.athleticAwards && !NONE.test(q.athleticAwards) && t("athleticAwards"),
  ].filter(Boolean);
  return [
    { label: "学历 / 专业", value: study.join("；") },
    { label: "学校", value: ["未披露", t("minors") && `辅修：${t("minors")}`].filter(Boolean).join("；") },
    { label: "职业经历", value: occupation.join("；") },
    { label: "学业成绩", value: grades.join("；") },
    { label: "技能 / 运动", value: skills.join("；") },
  ];
}

/** Shorten a translated answer to its first sentences within `max` characters. */
export function brief(s: string, max = 48): string {
  const t = tidy(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("；"), cut.lastIndexOf("！"));
  if (at >= 12) return tidy(cut.slice(0, at));
  const comma = cut.lastIndexOf("，");
  return `${cut.slice(0, comma >= 12 ? comma : max)}…`;
}

/** "兴趣与个人亮点" paragraphs after the site blurb. */
export function zhInterests(q: QuestionnaireView, t: (k: keyof Questionnaire) => string): string[] {
  const join = (xs: (string | false | null | undefined)[]) => {
    const parts = xs.filter(Boolean) as string[];
    return parts.length ? `${parts.join("；")}。` : "";
  };
  return [
    join([q.hobbies && `兴趣爱好：${brief(t("hobbies"))}`, q.creativity && `创意表达：${brief(t("creativity"))}`]),
    join([
      q.favoriteSport && `最喜欢的运动：${brief(t("favoriteSport"), 24)}`,
      q.favoriteFoods && `喜欢的食物：${brief(t("favoriteFoods"), 30)}`,
      q.favoriteAnimal && `最喜欢的动物：${brief(t("favoriteAnimal"), 24)}`,
      q.travelWish && `向往的旅行地：${brief(t("travelWish"), 36)}`,
      q.oneThing && `想让大家知道：${brief(t("oneThing"), 36)}`,
    ]),
  ].filter(Boolean);
}
