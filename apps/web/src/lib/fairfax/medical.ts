import type { PageBlock } from "@bb/shared";
import type { FamilyRow, HealthRecord } from "@/lib/medical/parse";
import { familyDiagnosisNames, medicalLeftovers } from "@/lib/profile/zh";

/**
 * Fairfax Medical Profile: derive the record's medical fields from the raw page capture (`medicalProfile`, the
 * `pageToJson` outline of download.aspx?prid=9). Runs on the server at capture time and again on boot whenever
 * PARSER_VERSION changes, so field changes never need a re-collection.
 *
 * Output reuses the cryobank shapes (`healthRecord`, `familyTable`, `familyDiagnoses`, `medicalPhrases`) so the
 * single-donor profile renders page 2 unchanged; `medicalQA` keeps every question/answer and `familyBackground` the
 * grandparents' origins.
 */
export const FAIRFAX_MEDICAL_PARSER_VERSION = 1;

export type MedicalQA = { section: string; question: string; answer: string };
export type FamilyBackground = { origins: { relation: string; origin: string }[]; ashkenazi: string | null; ashkenaziWho: string | null };
export type FairfaxMedical = {
  medicalQA: MedicalQA[];
  healthRecord: HealthRecord;
  familyTable: FamilyRow[];
  familyBackground: FamilyBackground;
  familyDiagnoses: string[];
  medicalPhrases: string[];
  medicalParserVersion: number;
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
/** "N/A", "N/A - N/A", "-", "" → empty. */
const blank = (s: string) => /^(?:n\/?a|none|-)?(?:\s*-\s*(?:n\/?a|none|-))*$/i.test(norm(s));
const isQaHeader = (row: string[]) => /^question$/i.test(row[0] ?? "") && /^response$/i.test(row[1] ?? "");
const DISEASE_HEADER = ["Disease", "Age Diagnosed", "Treatment For Condition"];
/** "Other" + "No (other) known diagnosed health problems…" is the site's way of saying none. */
const NOTHING = /no (?:other |known )*(?:diagnosed )?health problems/i;

/** "Your Mother's Sisters 2" → { relation: "MATERNAL AUNT", n: 2 }; unknown wording is kept upper-cased. */
export function relationOf(label: string): { relation: string; n: number | null } | null {
  const m = norm(label).match(/^Your\s+(.+?)(?:\s+(\d+))?$/i);
  if (!m) return null;
  const who = m[1].toLowerCase().replace(/[’']/g, "'");
  const MAP: Record<string, string> = {
    mother: "MOTHER",
    father: "FATHER",
    brother: "BROTHER",
    brothers: "BROTHER",
    sister: "SISTER",
    sisters: "SISTER",
    "mother's father": "MATERNAL GRANDFATHER",
    "mother's mother": "MATERNAL GRANDMOTHER",
    "father's father": "PATERNAL GRANDFATHER",
    "father's mother": "PATERNAL GRANDMOTHER",
    "mother's sister": "MATERNAL AUNT",
    "mother's sisters": "MATERNAL AUNT",
    "mother's brother": "MATERNAL UNCLE",
    "mother's brothers": "MATERNAL UNCLE",
    "father's sister": "PATERNAL AUNT",
    "father's sisters": "PATERNAL AUNT",
    "father's brother": "PATERNAL UNCLE",
    "father's brothers": "PATERNAL UNCLE",
    son: "SON",
    sons: "SON",
    daughter: "DAUGHTER",
    daughters: "DAUGHTER",
    "half brother": "HALF BROTHER",
    "half brothers": "HALF BROTHER",
    "half sister": "HALF SISTER",
    "half sisters": "HALF SISTER",
  };
  return { relation: MAP[who] ?? who.toUpperCase(), n: m[2] ? Number(m[2]) : null };
}

/** One relative while walking the family section. */
type Relative = { relation: string; n: number | null; age: string; living: string; cause: string; conditions: { disease: string; age: string; treatment: string }[]; healthy: boolean };

function treatmentClause(t: string): string {
  const s = norm(t);
  if (!s || /^unknown$/i.test(s)) return "Treatment unknown";
  if (/^(none|no treatment|n\/a)$/i.test(s)) return "No treatment";
  return s;
}

/** Relatives → cryobank-style rows: one per condition, "None" when healthy, "Deceased" carrying age and cause. */
function familyRows(rels: Relative[]): FamilyRow[] {
  const rows: FamilyRow[] = [];
  const counts = new Map<string, number>();
  for (const r of rels) counts.set(r.relation, (counts.get(r.relation) ?? 0) + 1);
  for (const r of rels) {
    const dead = /^dead|deceased/i.test(r.living);
    // Several aunts/brothers: keep them apart in the profile ("姨母（61岁）") — the note syntax zhRelation reads.
    const note = r.age && !blank(r.age) ? (dead ? `d. ${r.age}` : `age ${r.age}`) : (counts.get(r.relation) ?? 0) > 1 && r.n ? String(r.n) : "";
    const relation = note ? `${r.relation} (${note})` : r.relation;
    const real = r.conditions.filter((c) => !(/^other$/i.test(c.disease) && NOTHING.test(c.treatment)));
    for (const c of real) {
      // "Other" carries its description in the treatment cell ("Knee replacement, at age 40 due to an injury").
      const other = /^other$/i.test(c.disease) && c.treatment;
      const age = c.age && !blank(c.age) ? `Diagnosed at age ${norm(c.age)}` : other ? "" : "Diagnosed at unknown age";
      const details = [age, other ? norm(c.treatment) : treatmentClause(c.treatment)].filter(Boolean).join("; ");
      rows.push({ relation, diagnosis: other ? "Other" : norm(c.disease), details });
    }
    if (dead) {
      const cause = norm(r.cause);
      rows.push({ relation, diagnosis: "Deceased", details: [r.age && !blank(r.age) ? `Died at age ${norm(r.age)}` : "", blank(cause) ? "Cause of death unknown" : cause].filter(Boolean).join("; ") });
    } else if (!real.length) rows.push({ relation, diagnosis: "None", details: "" });
  }
  return rows;
}

const yesNo = (answer: string): string | null => {
  const a = norm(answer);
  if (!a) return null;
  if (blank(a) || /^no\b/i.test(a)) return "No";
  return "Yes";
};
/** "Yes - Ciprofloxacin, tendonitis" → "Ciprofloxacin, tendonitis"; "N/A - N/A" → null. */
const detail = (answer: string): string | null => {
  const a = norm(answer).replace(/^yes\s*[-–:]\s*/i, "");
  return blank(a) || /^(yes|no)$/i.test(a) ? null : a;
};
const find = (qa: MedicalQA[], re: RegExp) => qa.find((q) => re.test(q.question))?.answer ?? "";

export function parseFairfaxMedical(blocks: PageBlock[]): FairfaxMedical {
  const qa: MedicalQA[] = [];
  const rels: Relative[] = [];
  const background: FamilyBackground = { origins: [], ashkenazi: null, ashkenaziWho: null };
  let cur: Relative | null = null;

  for (const b of blocks) {
    const family = /family medical history/i.test(b.section);
    if (b.kind === "heading") {
      cur = null;
      continue;
    }
    if (b.kind === "table") {
      // A relative's "Health Problems" grid: Disease / Age Diagnosed / Treatment, or a single "Healthy" row.
      if (family && cur && (b.headers[0] === DISEASE_HEADER[0] || (b.rows.length === 1 && /^healthy$/i.test(b.rows[0][0] ?? "")))) {
        for (const [disease = "", age = "", treatment = ""] of b.rows) {
          if (/^healthy$/i.test(disease)) cur.healthy = true;
          else if (disease || treatment) cur.conditions.push({ disease, age, treatment });
        }
        continue;
      }
      const rows = b.rows.filter((r) => r.length >= 2);
      if (family && cur && rows.some(isQaHeader)) {
        for (const [q, a] of rows.filter((r) => !isQaHeader(r))) {
          if (/current age|age at death/i.test(q)) cur.age = norm(a);
          else if (/living\s*\/\s*dead/i.test(q)) cur.living = norm(a);
          else if (/cause of death/i.test(q)) cur.cause = norm(a);
        }
        continue;
      }
      if (family && !rows.some(isQaHeader)) {
        for (const [q, a] of rows) {
          const o = q.match(/^(.+?)\s+Ethnic Origins?$/i);
          if (o) background.origins.push({ relation: norm(o[1]), origin: norm(a) });
          else if (/ashkena/i.test(q)) background.ashkenazi = norm(a);
          else if (/^if yes,? who/i.test(q)) background.ashkenaziWho = blank(a) ? null : norm(a);
        }
        continue;
      }
      const section = norm(b.section.replace(/\s+See list of questions.*$/i, ""));
      for (const [q, a] of rows.filter((r) => !isQaHeader(r))) qa.push({ section, question: norm(q), answer: norm(a) });
      continue;
    }
    if (!family) continue;
    const texts = b.kind === "text" ? [b.text] : b.kind === "fields" ? b.items.map((i) => `${i.label}: ${i.value}`) : [];
    for (const t of texts.map(norm)) {
      const rel = relationOf(t);
      if (rel) {
        cur = { ...rel, age: "", living: "", cause: "", conditions: [], healthy: false };
        rels.push(cur);
      }
    }
  }

  const surgery = find(qa, /^list any operations/i);
  const allergies = find(qa, /^allergies/i);
  const diet = find(qa, /dietary restrictions/i);
  const healthRecord: HealthRecord = {
    surgery: yesNo(surgery),
    procedures: detail(surgery),
    anesthesia: null,
    anesthesiaComplications: null,
    allergies: yesNo(allergies),
    allergyDetails: detail(allergies),
    foodIntolerance: yesNo(diet),
    foodDetails: detail(diet),
  };
  const familyTable = familyRows(rels);
  return {
    medicalQA: qa,
    healthRecord,
    familyTable,
    familyBackground: background,
    familyDiagnoses: familyDiagnosisNames(familyTable),
    medicalPhrases: medicalLeftovers(healthRecord, familyTable),
    medicalParserVersion: FAIRFAX_MEDICAL_PARSER_VERSION,
  };
}

/**
 * Captures from plugin 0.4.3 flattened the Health Problems div grid into loose text (empty cells lost): their
 * conditions cannot be read reliably, and parsing them would report relatives as healthy. Such records keep no
 * derived fields until re-collected.
 */
export const isLegacyCapture = (blocks: PageBlock[]) => blocks.some((b) => b.kind === "text" && b.text === "Age Diagnosed");

/** Record data with the derived medical fields merged in (unchanged when there is no usable capture). */
export function withFairfaxMedical(data: Record<string, unknown>): Record<string, unknown> {
  const blocks = data.medicalProfile;
  if (!Array.isArray(blocks) || blocks.length === 0 || isLegacyCapture(blocks as PageBlock[])) return data;
  return { ...data, ...parseFairfaxMedical(blocks as PageBlock[]) };
}

/** Keys `withFairfaxMedical` writes (dropped again when a record's capture turns out unusable). */
export const FAIRFAX_MEDICAL_KEYS = ["medicalQA", "healthRecord", "familyTable", "familyBackground", "familyDiagnoses", "medicalPhrases", "medicalParserVersion"] as const;
