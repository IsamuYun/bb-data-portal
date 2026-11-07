import { describe, expect, it } from "vitest";
import { buildProfileModel, formatBloodType, formatEyesHair, formatHeight, formatWeight, needsManualCarriers, summarizeFamily } from "./model";
import { renderProfileHtml } from "./html";

describe("profile formatting", () => {
  it("formats basics like the template", () => {
    expect(formatHeight(`6'0" (183cm)`)).toBe("6英尺 / 182.9 cm");
    expect(formatHeight(`6'1" (185cm)`)).toBe("6英尺1英寸 / 185.4 cm");
    expect(formatWeight("175 lbs (79kg)")).toBe("175 lb / 约79 kg");
    expect(formatWeight("207 lbs")).toBe("207 lb / 约94 kg");
    expect(formatBloodType("A+")).toBe("A型 Rh阳性（A+）");
    expect(formatBloodType("O-")).toBe("O型 Rh阴性（O-）");
    expect(formatBloodType("Unknown")).toBe("Unknown");
    expect(formatEyesHair("棕色", "黑色", "直发")).toBe("棕眼 / 黑色直发");
  });
});

describe("buildProfileModel", () => {
  const data = {
    title: "Dr. Ironman",
    height: `6'0" (183cm)`,
    bloodType: "A+",
    badges: ["ID Disclosure"],
    birthYear: "1985",
    medicalConsultDate: "2023-05-08",
    gtsPanel: "GeneAware Expanded Plus Panel (445 genes)",
    gtsCarriers: [
      { gene: "GJB2", disease: "Nonsyndromic hearing loss, GJB2-related", result: "CARRIER", variant: "c.109G>A" },
      { gene: "ETHE1", disease: "Ethylmalonic encephalopathy", result: "CARRIER", variant: "c.554T>G" },
    ],
    gtsCarrierDiseases: ["Nonsyndromic hearing loss, GJB2-related", "Ethylmalonic encephalopathy"],
    personalHealth: [{ label: "过敏记录", text: "10至11岁确诊季节性过敏。" }],
    familyHistory: [{ relation: "外祖母", text: "骨质疏松，确诊年龄不详，未治疗。" }],
    riskAssessment: ["根据本人过敏史，子代过敏风险高于一般人群。"],
  };
  const zh = { title: "铁人医生", gtsCarrierDiseases: ["非综合征性听力损失（GJB2相关）", "乙基丙二酸脑病"] };

  it("does not read a Non-ID category as identity release", () => {
    const id = (badges: string[]) => buildProfileModel({ externalId: "1", data: { badges }, zh: null, media: [] }).basics.find((b) => b.label === "身份开放")?.value;
    expect(id(["Non-ID"])).toBe("否（匿名）");
    expect(id(["ID"])).toBe("开放身份（ID）");
    expect(id([])).toBe("未确认");
  });

  it("uses translations, sorts carriers by gene and builds the source note", () => {
    const m = buildProfileModel({ externalId: "19161", data, zh, media: [] });
    expect(m.title).toBe("铁人医生");
    expect(m.basics.find((b) => b.label === "出生年份")?.value).toBe("1985年");
    expect(m.basics.find((b) => b.label === "身份开放")?.value).toBe("开放身份（ID）");
    expect(m.basics.find((b) => b.label === "宗教")?.value).toBe("未提供");
    expect(m.carriers.kind === "carrier" && m.carriers.heading).toBe("携带者阳性 · 两项结果");
    expect(m.carriers.kind === "carrier" && m.carriers.items.map((i) => [i.gene, i.disease])).toEqual([
      ["ETHE1", "乙基丙二酸脑病"],
      ["GJB2", "非综合征性听力损失（GJB2相关）"],
    ]);
    expect(m.sources).toContain("健康与家族史问询（2023年5月8日）");
    expect(m.sources).not.toMatch(/cryobank/i);
  });

  it("states missing screening / medical data instead of leaving holes, and escapes HTML", () => {
    const m = buildProfileModel({ externalId: "1", data: { title: "<b>x</b>" }, zh: null, media: [] });
    expect(m.carriers).toMatchObject({ kind: "unknown", heading: "暂无基因筛查数据" });
    const html = renderProfileHtml(m, new Map());
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("暂无个人健康记录");
    expect(html).not.toMatch(/<script|https?:\/\//);
  });
  it("words the questionnaire and the parsed medical profile by rules", () => {
    const data = {
      educationLevel: "Postgraduate",
      about: "site blurb",
      degrees: ["B.S.", "M.D."],
      majors: "Political Science, Pre-Medicine",
      minors: "Chinese",
      hsGpa: "3.9",
      collegeGpa: "3.9",
      gradGpa: "3.5",
      honors: "Distinguished Graduate",
      occupation: "Physician",
      pastJobs: "Physician",
      military: "Yes",
      fullTimeStudent: "No",
      mechanicalSkills: ["Building computers"],
      mathSkills: "Excellent",
      languages: ["English"],
      sportsPlayed: ["Golf", "Triathlons"],
      hobbies: "Ironman competitions",
      favoriteAnimal: "Cat",
      healthRecord: { surgery: "No", procedures: null, anesthesia: null, anesthesiaComplications: null, allergies: "Yes", allergyDetails: "seasonal allergies; no treatment", foodIntolerance: "No", foodDetails: null },
      familyTable: [{ relation: "FATHER", diagnosis: "Dyslexia", details: "Diagnosed in adulthood; not treated." }],
      familyDiagnoses: ["Dyslexia"],
      medicalPhrases: ["seasonal allergies"],
      riskTopics: ["Family history of dyslexia"],
    };
    const zh = { majors: "政治学、医学预科", minors: "中文", honors: "优秀毕业生", occupation: "医生", pastJobs: "医生", hobbies: "铁人三项比赛", favoriteAnimal: "猫", familyDiagnoses: ["阅读障碍"], medicalPhrases: ["季节性过敏"], riskTopics: ["家族阅读障碍史"] };
    const m = buildProfileModel({ externalId: "19161", data, zh, media: [] });
    expect(m.education).toEqual([
      { label: "学历 / 专业", value: "医学博士（M.D.）、理学学士（B.S.）；专业：政治学、医学预科" },
      { label: "学校", value: "未披露；辅修：中文" },
      { label: "职业经历", value: "医生；有服役经历" },
      { label: "学业成绩", value: "高中GPA 3.9；大学GPA 3.9；研究生GPA 3.5；荣誉：优秀毕业生" },
      { label: "技能 / 运动", value: "组装电脑；数学优秀（微积分水平）；语言：英语；运动：高尔夫、铁人三项" },
    ]);
    expect(m.interests).toEqual(["site blurb", "兴趣爱好：铁人三项比赛。", "最喜欢的动物：猫。"]);
    expect(m.personalHealth).toEqual([
      { label: "手术记录", text: "无手术史。" },
      { label: "过敏记录", text: "季节性过敏；未治疗。" },
      { label: "食物不耐受", text: "无食物不耐受。" },
    ]);
    expect(m.familyHistory).toEqual([{ relation: "父亲", text: "阅读障碍：成年后确诊；未治疗。" }]);
    expect(m.riskAssessment).toEqual(["子代在以下方面的风险可能高于一般人群：家族阅读障碍史（具体风险无法准确量化）。"]);
    expect(m.sources).toContain("详细资料问卷");
  });
});

describe("profile for other sources", () => {
  it("never prints the source name and fills age / BMI / title from what the source has", () => {
    const m = buildProfileModel({
      externalId: "7128",
      data: { badges: ["Fairfax ID Reserve – 10 families"], ageRangeAtDonation: "23-28", height: "6'4\" (193cm)", weight: "195 lbs (88kg)", occupation: "US Army Military Police" },
      zh: { occupation: "美国陆军宪兵" },
      media: [],
    });
    const v = (l: string) => m.basics.find((b) => b.label === l)?.value;
    expect(v("身份开放")).toBe("开放身份（ID，限10个家庭）");
    expect(v("捐献时年龄")).toBe("23–28岁");
    expect(v("BMI")).toBe("23.6");
    expect(m.title).toBe("美国陆军宪兵");
    expect(JSON.stringify(m)).not.toMatch(/fairfax/i);
  });

  it("collapses relatives with nothing reported into one line", () => {
    const quiet = (relation: string) => ({ relation, text: "未报告显著疾病。" });
    expect(summarizeFamily([quiet("母亲（59岁）"), quiet("兄弟（26岁）"), quiet("兄弟（23岁）"), { relation: "祖父", text: "糖尿病。" }])).toEqual([
      { relation: "其他亲属", text: "母亲、兄弟（2人）均未报告显著疾病。" },
      { relation: "祖父", text: "糖尿病。" },
    ]);
    expect(summarizeFamily([quiet("母亲"), quiet("父亲")])).toHaveLength(2);
  });

  it("shows the qualifier of a non-plain carrier result", () => {
    const m = buildProfileModel({
      externalId: "1",
      data: { gtsPanel: "Panel (514 diseases)", gtsCarriers: [{ gene: "HBA2", disease: "Alpha-Thalassemia", result: "Silent Carrier", variant: "" }, { gene: "PEPD", disease: "Prolidase deficiency", result: "Carrier", variant: "" }], gtsCarrierDiseases: ["Alpha-Thalassemia", "Prolidase deficiency"] },
      zh: null,
      media: [],
    });
    expect(m.carriers.kind === "carrier" && m.carriers.items.map((i) => i.status)).toEqual(["静默携带者", ""]);
  });
});

describe("hand-curated carrier screening", () => {
  const data = { gtsPanel: "GeneAware Comprehensive+ (611) (611 genes)", gtsCarriers: null };
  it("flags an unextracted report and prints the curated rows instead", () => {
    expect(needsManualCarriers(data, {})).toBe(true);
    const manual = { carriers: { kind: "carrier" as const, panel: "GeneAware Comprehensive+ (611 genes)", items: [{ gene: "BCKDHA", disease: "枫糖尿病1a型", diseaseEn: "Maple Syrup Urine Disease, Type 1a" }, { gene: "ABCA4", disease: "Stargardt病", status: "静默携带者" }], updatedAt: "2026-11-07T00:00:00Z" } };
    expect(needsManualCarriers(data, manual)).toBe(false);
    const c = buildProfileModel({ externalId: "22199", data, zh: null, media: [], manual }).carriers;
    expect(c).toMatchObject({ kind: "carrier", heading: "携带者阳性 · 两项结果", note: "结果来源：GeneAware Comprehensive+ (611 genes)（结果摘要）。" });
    expect(c.kind === "carrier" && c.items.map((i) => [i.gene, i.disease, i.status])).toEqual([["ABCA4", "Stargardt病", "静默携带者"], ["BCKDHA", "枫糖尿病1a型", ""]]);
  });
  it("prints no carriers when curated so, and a parsed result needs nothing", () => {
    const manual = { carriers: { kind: "none" as const, panel: "", items: [], updatedAt: "" } };
    expect(buildProfileModel({ externalId: "1", data, zh: null, media: [], manual }).carriers).toMatchObject({ kind: "none", heading: "未检出携带者" });
    expect(needsManualCarriers({ gtsPanel: "x", gtsCarriers: [] }, {})).toBe(false);
    expect(needsManualCarriers({}, {})).toBe(false);
  });
});
