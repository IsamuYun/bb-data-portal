import { describe, expect, it } from "vitest";
import type { FormPage, TextItem } from "@/lib/donor-profile/form";
import { familyDiagnosisNames, medicalLeftovers, zhClause, zhFamily, zhHealth, zhRelation, zhRisk } from "@/lib/profile/zh";
import { parseChecklist, parseFamilyTable, parseHealth, parseRiskTopics } from "./parse";
import { parseMedicalHeader } from "./profile";

// Text as unpdf extracts it from cryobank Medical Profiles (CCB-FORM-0543), trimmed.
const TEXT = `Generate Life Sciences Proprietary document. Unauthorized use or distribution without prior Generate consent is prohibited.
MC# CCB-FORM-0543 REV: 01 Page 1 of 4
Donor 21383
Medical Profile
PERSONAL HEALTH HISTORY SUMMARY
CONSULTATION DATE DONOR’S YEAR OF BIRTH
08/21/2024 1997
Does the donor have any allergies? Yes
CURRENT AGE OR AGE AT DEATH (d.)
DONOR MOTHER FATHER MATERNAL
GRANDMOTHER
MATERNAL
GRANDFATHER
PATERNAL
GRANDMOTHER
PATERNAL
GRANDFATHER
27 54 63 d. 77 d. 83 99 d. 82
FAMILY MEMBER DIAGNOSIS HEALTH DETAILS
As part of the donor screening process, a donor applicant completes a family history screening form
Alcoholism/Drug abuse Heart attack prior to age 50`;

describe("medical profile parsing", () => {
  it("reads consultation date and year of birth", () => {
    expect(parseMedicalHeader(TEXT)).toEqual({ birthYear: "1997", medicalConsultDate: "2024-08-21" });
  });

  it("reads each health answer up to the next question", () => {
    const h = parseHealth(
      "Has the donor ever had surgery? Yes Procedures/indications and age(s), if applicable: Wisdom teeth removal at age 16 If applicable, was general anesthesia used? Yes Anesthesia-related complications, if applicable: None ALLERGIES Does the donor have any allergies? No If yes, please describe: N/A Does the donor have any food intolerances? No If yes, please describe (e.g. lactose, gluten): N/A GENETIC FAMILY HISTORY SUMMARY",
    );
    expect(h).toEqual({ surgery: "Yes", procedures: "Wisdom teeth removal at age 16", anesthesia: "Yes", anesthesiaComplications: "None", allergies: "No", allergyDetails: null, foodIntolerance: "No", foodDetails: null });
  });

  it("cuts the family table along its ruling lines, carrying a relative over to the next page", () => {
    const t = (x: number, y: number, str: string): TextItem => ({ str, x, y, w: str.length * 5, h: 9 });
    const rule = (x0: number, x1: number, y: number) => ({ x0, x1, y0: y, y1: y + 0.6 });
    const cells = (y: number) => [rule(72, 167, y), rule(168, 251, y), rule(252, 549, y)];
    const page1: FormPage = {
      items: [t(78, 326, "FAMILY MEMBER"), t(173, 326, "DIAGNOSIS"), t(257, 326, "HEALTH DETAILS (age at diagnosis, treatment, etc.)"),
        t(78, 297, "DONOR"), t(173, 297, "NONE"),
        t(78, 194, "MATERNAL"), t(78, 181, "GRANDFATHER"), t(173, 190, "Diabetes Type II"), t(257, 194, "Diagnosed in his 60s; treatment"), t(257, 187, "unknown."),
        t(173, 160, "Deceased"), t(257, 160, "Died in his 70-80s; cause unknown."),
        t(78, 120, "PATERNAL"), t(78, 110, "GRANDMOTHER"), t(173, 115, "Alzheimer’s"), t(173, 106, "Disease"), t(257, 112, "Diagnosed in her 70s; no treatment.")],
      paths: [...cells(318), ...cells(282), rule(168, 251, 172), rule(252, 549, 172), ...cells(148), ...cells(95)],
    };
    const page2: FormPage = {
      items: [t(37, 746, "Donor 19161"), t(173, 650, "Deceased"), t(257, 650, "Died in her 80s; cause of death unknown."), t(274, 394, "RISK ASSESSMENT")],
      paths: [...cells(678), ...cells(630), rule(72, 549, 410)],
    };
    const rows = parseFamilyTable([page1, page2]);
    expect(rows).toEqual([
      { relation: "DONOR", diagnosis: "NONE", details: "" },
      { relation: "MATERNAL GRANDFATHER", diagnosis: "Diabetes Type II", details: "Diagnosed in his 60s; treatment unknown." },
      { relation: "MATERNAL GRANDFATHER", diagnosis: "Deceased", details: "Died in his 70-80s; cause unknown." },
      { relation: "PATERNAL GRANDMOTHER", diagnosis: "Alzheimer’s Disease", details: "Diagnosed in her 70s; no treatment." },
      { relation: "PATERNAL GRANDMOTHER", diagnosis: "Deceased", details: "Died in her 80s; cause of death unknown." },
    ]);
    expect(familyDiagnosisNames(rows)).toEqual(["Diabetes Type II", "Alzheimer’s Disease"]);
    const zh = zhFamily(rows, (d) => ({ "Diabetes Type II": "2型糖尿病", "Alzheimer’s Disease": "阿尔茨海默病" })[d] ?? d, (p) => p);
    expect(zh).toEqual([
      { relation: "本人", text: "未报告显著疾病。" },
      { relation: "外祖父", text: "2型糖尿病：60多岁确诊；治疗情况不详；70至80多岁去世；死因不详。" },
      { relation: "祖母", text: "阿尔茨海默病：70多岁确诊；未治疗；80多岁去世；死因不详。" },
    ]);
  });

  it("reads the older checklist form: ✓ columns become relatives, comments attach to the nearest row", () => {
    const t = (x: number, y: number, str: string, w = str.length * 4.5): TextItem => ({ str, x, y, w, h: 9 });
    const page: FormPage = {
      items: [
        // family-size table on page 1 uses the same labels; it must not be taken for the checklist header
        t(301, 460, "F"), t(343, 460, "MGM"), t(373, 460, "MGF"), t(401, 460, "PGM"), t(431, 460, "PGF"),
        t(72, 484, "Medical Problem"), t(181, 484, "You Mother Father ", 76), t(625, 484, "CCB Genetic Counselor Comments"), t(584, 491, "No"),
        t(272, 469, "F"), t(292, 469, "M"), t(309, 469, "MGM MGF PGM PGF Mat Pat Mat Pat", 175), t(503, 469, "F"), t(523, 469, "M"), t(545, 469, "F"), t(565, 469, "M"),
        t(44, 439, "a."), t(57, 439, "Arthritis"), t(585, 439, "✓"),
        t(44, 419, "b."), t(57, 419, "Cataracts"), t(341, 419, "✓"), t(603, 425, "Diagnosed at age 82; treated with surgery; no known"), t(603, 413, "contributing factors."),
        t(44, 399, "c."), t(57, 399, "Gall stones"), t(409, 399, "✓"), t(603, 399, "(b. 1967) diagnosed at age 45."),
        t(722, 21, "Medical History Page 11 of 12"),
      ],
      paths: [],
    };
    expect(parseChecklist([page])).toEqual([
      { relation: "MATERNAL GRANDFATHER", diagnosis: "Cataracts", details: "Diagnosed at age 82; treated with surgery; no known contributing factors." },
      { relation: "MATERNAL AUNT (b. 1967)", diagnosis: "Gall stones", details: "Diagnosed at age 45." },
    ]);
  });

  it("reads revision 0.0 of the checklist, whose header prints 'MotherFather' without a space", () => {
    const t = (x: number, y: number, str: string, w = str.length * 4.5): TextItem => ({ str, x, y, w, h: 9 });
    const page: FormPage = {
      items: [
        t(70, 405, "Medical Problem"), t(177, 405, "You MotherFather", 72), t(648, 405, "CCB Genetic Counselor Comments"), t(630, 412, "No"), t(627, 397, "one "),
        t(266, 390, "F"), t(291, 390, "M"), t(310, 390, "MGM MGF PGM PGF", 100), t(419, 390, "Mat"), t(446, 390, "Pat"), t(472, 390, "Mat"), t(499, 390, "Pat"), t(530, 390, "F"), t(555, 390, "M"), t(583, 390, "F"), t(608, 390, "M"),
        t(41, 360, "a."), t(55, 360, "Aneurysm"), t(630, 360, "✓"),
        t(42, 345, "b."), t(55, 345, "Gout"), t(233, 345, "✓"), t(649, 345, "Diagnosed in his 50s."),
        // wrapped name with the letter on the middle line; two comment blocks only 12.6pt apart
        t(55, 331, "Blocked arteries/bypass"), t(42, 325, "c."), t(55, 319, "surgery"), t(343, 325, "✓"), t(649, 331.6, "MGF had bypass"), t(649, 319.6, "surgery at 70."),
        t(41, 305, "d."), t(55, 305, "Stroke"), t(501, 305, "✓"), t(649, 307, "Uncle at 80."),
      ],
      paths: [],
    };
    expect(parseChecklist([page])).toEqual([
      { relation: "FATHER", diagnosis: "Gout", details: "Diagnosed in his 50s." },
      { relation: "MATERNAL GRANDFATHER", diagnosis: "Blocked arteries/bypass surgery", details: "MGF had bypass surgery at 70." },
      { relation: "PATERNAL UNCLE", diagnosis: "Stroke", details: "Uncle at 80." },
    ]);
  });

  it("picks the risk headings only", () => {
    const text = "reported, other than the risks specified below:\nDonor’s history of allergies\nAllergies are usually multifactorial conditions involving both familial and environmental factors. Based on the\nrisk; however, a specific risk is unknown (PMID: 25459575).\nFamily history of dyslexia\nLearning disorders, such as dyslexia, are common.\nProspective recipients are encouraged";
    expect(parseRiskTopics(text)).toEqual(["Donor’s history of allergies", "Family history of dyslexia"]);
    expect(parseRiskTopics("There is no evidence of an increased risk for any health problems.")).toEqual([]);
    expect(zhRisk([])).toEqual(["未发现高于一般人群的特定风险。"]);
  });
});

describe("Chinese wording rules", () => {
  it("translates the common clauses and leaves the rest to the dictionary", () => {
    expect(zhClause("Diagnosed at about age 72")).toBe("约72岁确诊");
    expect(zhClause("contributing factors may have included age.")).toBe("诱因可能包括年龄");
    expect(zhClause("treats with over the counter medication as needed")).toBe("按需使用非处方药");
    expect(zhClause("Died in his 50s due to an unknown cause")).toBe("50多岁去世，死因不详");
    expect(zhClause("Diagnosed in childhood, specific age is unknown")).toBe("童年时确诊，具体年龄不详");
    expect(zhClause("resolved within about 1 year")).toBe("约1年内痊愈");
    expect(zhClause("Wisdom teeth removal at age 16")).toBeNull();
    const h = { surgery: "Yes", procedures: "Wisdom teeth removal at age 16", anesthesia: "Yes", anesthesiaComplications: "None", allergies: "No", allergyDetails: null, foodIntolerance: "No", foodDetails: null };
    expect(medicalLeftovers(h, [])).toEqual(["Wisdom teeth removal at age 16"]);
    expect(zhHealth(h, (p) => (p === "Wisdom teeth removal at age 16" ? "16岁拔除智齿" : p))).toEqual([
      { label: "手术记录", text: "16岁拔除智齿；曾使用全身麻醉；无麻醉相关并发症。" },
      { label: "过敏记录", text: "无过敏史。" },
      { label: "食物不耐受", text: "无食物不耐受。" },
    ]);
  });

  it("names relatives with their notes", () => {
    expect(zhRelation("PATERNAL MALE COUSIN (B. 1994)")).toBe("父系男性表亲（1994年出生）");
    expect(zhRelation("MATERNAL UNCLE (d. 30s)")).toBe("舅舅（30多岁去世）");
    expect(zhRelation("MATERNAL AUNT (age 68)")).toBe("姨母（68岁）");
    expect(zhRelation("STEPFATHER")).toBe("STEPFATHER");
  });
});
