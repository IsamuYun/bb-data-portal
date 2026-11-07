import { describe, expect, it } from "vitest";
import type { PageBlock } from "@bb/shared";
import { buildProfileModel } from "@/lib/profile/model";
import { parseFairfaxMedical, relationOf, withFairfaxMedical } from "./medical";

const FAM = "Family Medical History See list of questions asked here";
const h = (text: string): PageBlock => ({ kind: "heading", level: 4, text, section: text });
const qa = (section: string, rows: string[][]): PageBlock => ({ kind: "table", section, headers: [], rows: [["Question", "Response"], ...rows] });
const t = (text: string): PageBlock => ({ kind: "text", section: FAM, text });
/** The relative's "Health Problems" div table: Disease / Age Diagnosed / Treatment. */
const grid = (...rows: string[][]): PageBlock => ({ kind: "table", section: FAM, headers: ["Disease", "Age Diagnosed", "Treatment For Condition"], rows });
const healthy: PageBlock = { kind: "table", section: FAM, headers: [], rows: [["Healthy"]] };
const member = (age: string, living: string, cause = "N/A") =>
  qa(FAM, [["Current age or age at death", age], ["Living / Dead", living], ["Cause of death and any treatment prior to death", cause]]);

/** Synthetic capture in the layout of download.aspx?prid=9 (values made up). */
const blocks: PageBlock[] = [
  { kind: "heading", level: 1, text: "Donor Number: 1234", section: "Donor Number: 1234" },
  h("Personal Behavior History"),
  qa("Personal Behavior History", [["Do you sleep well?", "Yes"], ["Any dietary restrictions? If yes, explain:", "No"]]),
  h("Donor Medical History"),
  qa("Donor Medical History", [
    ["List any operations: Age & reason:", "N/A - N/A"],
    ["Allergies (medicines, food, pollens)? If yes, please list substance and reaction caused:", "Yes - Penicillin, rash"],
  ]),
  h(FAM),
  t("See list of questions asked here"),
  { kind: "table", section: FAM, headers: [], rows: [["Mother's Father Ethnic Origins", "Irish"], ["Is anyone in your family of Ashkenazai Jewish Heritage?", "No"], ["If yes, who?", "N/A"]] },
  t("Your Mother"),
  member("60", "Living"),
  grid(["Gallstones", "55", "Gallbladder removed"], ["Asthma", "12", "Unknown"]),
  t("Brothers"),
  t("Your Brother 1"),
  member("30", "Living"),
  healthy,
  t("Your Mother's Father"),
  member("85", "Dead", "Old Age (specific cause undetermined)"),
  grid(["Other", "", "No other diagnosed health problems at time of death"]),
  t("Your Mother's Sisters 1"),
  member("N/A", "Living"),
  healthy,
  t("Your Mother's Sisters 2"),
  member("N/A", "Living"),
  grid(["High blood pressure", "40", "Beta Blockers"], ["Other", "", "Knee replacement, at age 40 due to an injury"]),
  t("Brothers"),
];

describe("relationOf", () => {
  it("maps Fairfax relative labels onto the shared vocabulary", () => {
    expect(relationOf("Your Mother's Sisters 2")).toEqual({ relation: "MATERNAL AUNT", n: 2 });
    expect(relationOf("Your Father’s Father")).toEqual({ relation: "PATERNAL GRANDFATHER", n: null });
    expect(relationOf("Brothers")).toBeNull();
  });
});

describe("parseFairfaxMedical", () => {
  const m = parseFairfaxMedical(blocks);

  it("keeps every question and answer, per section", () => {
    expect(m.medicalQA).toEqual([
      { section: "Personal Behavior History", question: "Do you sleep well?", answer: "Yes" },
      { section: "Personal Behavior History", question: "Any dietary restrictions? If yes, explain:", answer: "No" },
      { section: "Donor Medical History", question: "List any operations: Age & reason:", answer: "N/A - N/A" },
      { section: "Donor Medical History", question: "Allergies (medicines, food, pollens)? If yes, please list substance and reaction caused:", answer: "Yes - Penicillin, rash" },
    ]);
  });

  it("fills the shared health record", () => {
    expect(m.healthRecord).toMatchObject({ surgery: "No", procedures: null, allergies: "Yes", allergyDetails: "Penicillin, rash", foodIntolerance: "No" });
  });

  it("turns relatives and their condition grids into family rows", () => {
    expect(m.familyTable).toEqual([
      { relation: "MOTHER (age 60)", diagnosis: "Gallstones", details: "Diagnosed at age 55; Gallbladder removed" },
      { relation: "MOTHER (age 60)", diagnosis: "Asthma", details: "Diagnosed at age 12; Treatment unknown" },
      { relation: "BROTHER (age 30)", diagnosis: "None", details: "" },
      { relation: "MATERNAL GRANDFATHER (d. 85)", diagnosis: "Deceased", details: "Died at age 85; Old Age (specific cause undetermined)" },
      { relation: "MATERNAL AUNT (1)", diagnosis: "None", details: "" },
      { relation: "MATERNAL AUNT (2)", diagnosis: "High blood pressure", details: "Diagnosed at age 40; Beta Blockers" },
      { relation: "MATERNAL AUNT (2)", diagnosis: "Other", details: "Knee replacement, at age 40 due to an injury" },
    ]);
    expect(m.familyBackground).toEqual({ origins: [{ relation: "Mother's Father", origin: "Irish" }], ashkenazi: "No", ashkenaziWho: null });
    expect(m.familyDiagnoses).toEqual(["Gallstones", "Asthma", "High blood pressure", "Other"]);
    // Clauses the wording rules do not cover go to the dictionary.
    expect(m.medicalPhrases).toEqual(expect.arrayContaining(["Gallbladder removed", "Beta Blockers", "Penicillin, rash"]));
  });

  it("feeds page 2 of the single-donor profile", () => {
    const p = buildProfileModel({ externalId: "1234", data: withFairfaxMedical({ medicalProfile: blocks }), zh: null, media: [] });
    expect(p.personalHealth.map((x) => x.label)).toEqual(["手术记录", "过敏记录", "食物不耐受"]);
    expect(p.familyHistory.map((f) => f.relation)).toEqual(["母亲（60岁）", "兄弟（30岁）", "外祖父（85岁去世）", "姨母（1）", "姨母（2）"]);
    expect(p.familyHistory[0].text).toContain("55岁确诊");
    expect(p.familyHistory[2].text).toContain("85岁去世");
  });

  it("leaves records without a usable capture alone", () => {
    expect(withFairfaxMedical({ height: "6'0\"" })).toEqual({ height: "6'0\"" });
    // Plugin 0.4.3 flattened the grid into loose text: no derived fields rather than "healthy" relatives.
    const legacy = [t("Your Mother"), t("Disease"), t("Age Diagnosed"), t("Treatment For Condition"), t("Asthma"), t("12"), t("Inhaler")];
    expect(withFairfaxMedical({ medicalProfile: legacy })).toEqual({ medicalProfile: legacy });
  });
});
