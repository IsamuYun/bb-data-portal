import type { Box, FormPage, TextItem } from "@/lib/donor-profile/form";

/**
 * Deterministic reading of the cryobank Medical Profile (CCB-FORM-0543, `<no>MH.pdf`): the personal health answers,
 * the three-generation family history table and the risk-assessment topics. No model: the questions are fixed text,
 * and the table rows are cut along the ruling lines drawn between them (member column lines separate relatives,
 * diagnosis column lines separate one relative's diagnoses; a relative's rows can continue on the next page).
 */

export type HealthRecord = {
  surgery: string | null;
  procedures: string | null;
  anesthesia: string | null;
  anesthesiaComplications: string | null;
  allergies: string | null;
  allergyDetails: string | null;
  foodIntolerance: string | null;
  foodDetails: string | null;
};
export type FamilyRow = { relation: string; diagnosis: string; details: string };
export type MedicalParse = { healthRecord: HealthRecord; familyTable: FamilyRow[]; riskTopics: string[] };

type Line = { y: number; items: TextItem[]; text: string };

const PAGE_CHROME = /^(Donor \d+|Medical Profile|Page \d+ of \d+)$|Proprietary document|^MC#|^Donor # \d+/i;

/** Text items grouped into lines (top to bottom), items in a line left to right. */
export function linesOf(items: TextItem[]): Line[] {
  const rows: { y: number; items: TextItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => {
      const items = r.items.sort((a, b) => a.x - b.x);
      return { y: r.y, items, text: items.map((i) => i.str.trim()).join(" ") };
    });
}

const clean = (s: string | undefined | null) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return !t || /^(n\/?a|not applicable)\.?$/i.test(t) ? null : t;
};

/** Personal health answers: each question's answer runs until the next question. */
export function parseHealth(text: string): HealthRecord {
  const flat = text.replace(/\s+/g, " ");
  const grab = (q: RegExp, next: RegExp) => {
    const m = flat.match(new RegExp(`${q.source}\\s*(.*?)\\s*(?=${next.source}|$)`, "i"));
    return clean(m?.[1]);
  };
  return {
    surgery: grab(/Has the donor ever had surgery\?/, /Procedures\/indications/),
    procedures: grab(/Procedures\/indications and age\(s\), if applicable:/, /If applicable, was general anesthesia used\?/),
    anesthesia: grab(/If applicable, was general anesthesia used\?/, /Anesthesia-related complications/),
    anesthesiaComplications: grab(/Anesthesia-related complications, if applicable:/, /ALLERGIES/),
    allergies: grab(/Does the donor have any allergies\?/, /If yes, please describe:/),
    allergyDetails: grab(/If yes, please describe:/, /Does the donor have any food intolerances\?/),
    foodIntolerance: grab(/Does the donor have any food intolerances\?/, /If yes, please describe \(e\.g\./),
    foodDetails: grab(/If yes, please describe \(e\.g\. lactose, gluten\):/, /GENETIC FAMILY HISTORY SUMMARY/),
  };
}

const joinLines = (items: TextItem[]) =>
  linesOf(items)
    .map((l) => l.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/(\w)- (\w)/g, "$1-$2")
    .trim();

const covers = (b: Box, x: number) => b.x0 <= x && b.x1 >= x;
const isRule = (b: Box) => b.y1 - b.y0 < 2 && b.x1 - b.x0 > 40;

/** The family history table, possibly spread over several pages. */
export function parseFamilyTable(pages: FormPage[]): FamilyRow[] {
  const rows: FamilyRow[] = [];
  let cols: { member: number; diag: number; details: number } | null = null;
  let relation = "";
  for (const page of pages) {
    const lines = linesOf(page.items);
    // The table ends at the risk assessment; later pages (the generic list of screened conditions) are other tables.
    if (cols && !lines.some((l) => /FAMILY MEMBER/.test(l.text)) && lines.some((l) => /^As part of the donor screening/.test(l.text))) break;
    const header = lines.find((l) => /FAMILY MEMBER/.test(l.text) && /DIAGNOSIS/.test(l.text));
    if (header) {
      const at = (re: RegExp) => header.items.find((i) => re.test(i.str))?.x ?? 0;
      cols = { member: at(/FAMILY MEMBER/) - 6, diag: at(/DIAGNOSIS/) - 6, details: at(/HEALTH DETAILS/) - 6 };
    }
    if (!cols) continue;
    const top = header ? header.y : Infinity;
    const risk = lines.find((l) => /^RISK ASSESSMENT$/.test(l.text));
    const bottom = risk ? risk.y : -Infinity;
    const last = !!risk;
    const inTable = (y: number) => y < top && y > bottom;
    const items = page.items.filter((i) => i.str.trim() && inTable(i.y) && !PAGE_CHROME.test(i.str.trim()));
    const rules = page.paths.filter((b) => isRule(b) && b.y0 < top && b.y0 > bottom - 20);
    const levels = (x: number) => [...new Set(rules.filter((b) => covers(b, x)).map((b) => Math.round(b.y0 * 2) / 2))].sort((a, b) => b - a);
    const memberMid = (cols.member + cols.diag) / 2;
    const diagMid = (cols.diag + cols.details) / 2;
    const memberCuts = levels(memberMid);
    const diagCuts = levels(diagMid);
    for (let k = 0; k + 1 < diagCuts.length; k++) {
      const [hi, lo] = [diagCuts[k], diagCuts[k + 1]];
      const band = items.filter((i) => i.y < hi && i.y > lo);
      if (!band.length) continue;
      // The relative's cell spans this diagnosis row: the member band between the member rules around it.
      const mHi = memberCuts.filter((y) => y >= hi - 0.5).at(-1) ?? hi;
      const mLo = memberCuts.find((y) => y <= lo + 0.5) ?? lo;
      const who = joinLines(items.filter((i) => i.x < cols!.diag && i.y < mHi && i.y > mLo));
      if (who) relation = who;
      const diagnosis = joinLines(band.filter((i) => i.x >= cols!.diag && i.x < cols!.details));
      const details = joinLines(band.filter((i) => i.x >= cols!.details));
      if (!relation || (!diagnosis && !details)) continue;
      rows.push({ relation, diagnosis, details });
    }
    if (last) break;
  }
  return rows;
}

/**
 * Topics the specialist singled out ("…other than the risks specified below:"), i.e. the short heading lines of the
 * risk-assessment section, e.g. "Donor’s history of allergies". Empty when no increased risk was found.
 */
export function parseRiskTopics(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !PAGE_CHROME.test(l));
  const start = lines.findIndex((l) => /risks specified below:?$/i.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^Prospective recipients|^As part of the donor screening/i.test(l)) break;
    const prev = lines[i - 1];
    if (l.length <= 80 && !/[.,;:]$/.test(l) && /[.:)]$/.test(prev)) out.push(l.replace(/\s+/g, " "));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Older form (REP-DNR-F060, until about 2020): a checklist of medical problems × relatives, ✓ marks as text, and a
// "CCB Genetic Counselor Comments" column. Each checked relative becomes a family row with the row's comment.

type Column = { x: number; relation: string | null };

/** Centres of the space-separated tokens of one text item, estimated from character positions. */
function tokenCentres(it: TextItem): { token: string; x: number }[] {
  const out: { token: string; x: number }[] = [];
  const re = /\S+/g;
  const len = it.str.length || 1;
  for (let m = re.exec(it.str); m; m = re.exec(it.str)) out.push({ token: m[0], x: it.x + (it.w * (m.index + m[0].length / 2)) / len });
  return out;
}

const GRID: Record<string, string> = { MGM: "MATERNAL GRANDMOTHER", MGF: "MATERNAL GRANDFATHER", PGM: "PATERNAL GRANDMOTHER", PGF: "PATERNAL GRANDFATHER" };

/** Relative columns of a checklist page, from its two header rows. */
function checklistColumns(lines: Line[]): Column[] {
  // Revision 0.0 prints the header as "You MotherFather" (no space between the two words).
  const top = lines.find((l) => /You\s*Mother\s*Father/.test(l.text));
  if (!top) return [];
  // The sub-header right under "You Mother Father" (page 1 also has a family-size table with the same labels above).
  const sub = lines.find((l) => /MGM\s+MGF\s+PGM\s+PGF/.test(l.text) && l.y < top.y && l.y > top.y - 30);
  if (!sub) return [];
  const cols: Column[] = [];
  for (const it of top.items) {
    const len = it.str.length || 1;
    for (const m of it.str.matchAll(/You|Mother|Father/g)) {
      const x = it.x + (it.w * (m.index! + m[0].length / 2)) / len;
      cols.push({ x, relation: { You: "DONOR", Mother: "MOTHER", Father: "FATHER" }[m[0]]! });
    }
  }
  const subTokens = sub.items.flatMap(tokenCentres).sort((a, b) => a.x - b.x);
  const grid = subTokens.findIndex((t) => t.token === "MGM");
  // F M (siblings) | MGM MGF PGM PGF | Mat Pat (aunts) Mat Pat (uncles) | F M (maternal cousins) F M (paternal cousins)
  const before = subTokens.slice(0, Math.max(grid, 0));
  const after = subTokens.slice(grid);
  const sib = before.filter((t) => /^[FM]$/.test(t.token));
  sib.forEach((t) => cols.push({ x: t.x, relation: t.token === "F" ? "SISTER" : "BROTHER" }));
  const matPat = after.filter((t) => /^(Mat|Pat)$/.test(t.token));
  matPat.forEach((t, i) => cols.push({ x: t.x, relation: `${t.token === "Mat" ? "MATERNAL" : "PATERNAL"} ${i < 2 ? "AUNT" : "UNCLE"}` }));
  after.filter((t) => GRID[t.token]).forEach((t) => cols.push({ x: t.x, relation: GRID[t.token] }));
  const cousins = after.filter((t) => /^[FM]$/.test(t.token));
  cousins.forEach((t, i) => cols.push({ x: t.x, relation: `${i < 2 ? "MATERNAL" : "PATERNAL"} ${t.token === "F" ? "FEMALE" : "MALE"} COUSIN` }));
  const noOne = lines.flatMap((l) => l.items).find((i) => /^No$/.test(i.str.trim()) && i.x > 500);
  if (noOne) cols.push({ x: noOne.x + 4, relation: null });
  return cols.sort((a, b) => a.x - b.x);
}

export function parseChecklist(pages: FormPage[]): FamilyRow[] {
  const rows: FamilyRow[] = [];
  for (const page of pages) {
    const lines = linesOf(page.items).filter((l) => !PAGE_CHROME.test(l.text) && !/REP-DNR-F\d+/.test(l.text));
    const cols = checklistColumns(lines);
    const header = lines.find((l) => /CCB Genetic Counselor Comments/.test(l.text));
    if (!cols.length || !header) continue;
    const commentX = header.items.find((i) => /Comments/.test(i.str))!.x - 30;
    const chrome = /Page \d+ of \d+|Proprietary document|REP-DNR-F\d+|Unauthorized use/i;
    const body = page.items.filter((i) => i.str.trim() && i.y < header.y - 20 && i.y > 40 && !chrome.test(i.str));
    // Every row has at least one ✓ ("No one" when nobody had it), printed at the row's vertical centre. The row letters
    // are not: revision 1.0 puts "c." on the first line of a wrapped name, revision 0.0 on the middle.
    const isTick = (i: TextItem) => /^[✓✔√]$/.test(i.str.trim());
    const ticks = body.filter(isTick);
    const centres: number[] = [];
    for (const y of ticks.map((i) => i.y).sort((a, b) => b - a)) if (!centres.length || centres.at(-1)! - y > 3) centres.push(y);
    const nameRight = (cols[0]?.x ?? 170) - 15;
    const names = body.filter((i) => i.x >= 50 && i.x < nameRight && !/^[a-z]{1,2}\.$/.test(i.str.trim()) && !/^\d+\.\s/.test(i.str.trim()));
    const comments = linesOf(body.filter((i) => i.x >= commentX && !isTick(i))).map((l) => ({ y: l.y, text: l.text }));
    // Comment lines into blocks (consecutive lines, 12pt apart; separate blocks are at least ~12.6pt apart), each placed
    // at its vertical centre.
    const blocks: { y: number; text: string }[] = [];
    let cur: { ys: number[]; parts: string[] } | null = null;
    for (const c of comments) {
      if (cur && cur.ys.at(-1)! - c.y <= 12.3) {
        cur.ys.push(c.y);
        cur.parts.push(c.text);
      } else {
        if (cur) blocks.push({ y: (cur.ys[0] + cur.ys.at(-1)!) / 2, text: cur.parts.join(" ") });
        cur = { ys: [c.y], parts: [c.text] };
      }
    }
    if (cur) blocks.push({ y: (cur.ys[0] + cur.ys.at(-1)!) / 2, text: cur.parts.join(" ") });

    const nearest = (y: number) => centres.reduce((best, c) => (Math.abs(c - y) < Math.abs(best - y) ? c : best), centres[0]);
    const parsed = centres.map((centre) => {
      const name = joinLines(names.filter((i) => Math.abs(i.y - centre) < 12 && nearest(i.y) === centre));
      const checked = ticks
        .filter((i) => Math.abs(i.y - centre) <= 3)
        .map((i) => cols.reduce((best, c) => (Math.abs(c.x - i.x) < Math.abs(best.x - i.x) ? c : best), cols[0]))
        .filter((c) => c.relation)
        .map((c) => c.relation!);
      return { name, centre, checked };
    });
    for (const b of blocks) {
      const row = parsed.reduce<(typeof parsed)[number] | null>((best, r) => (!best || Math.abs(r.centre - b.y) < Math.abs(best.centre - b.y) ? r : best), null);
      if (row) (row as { comment?: string }).comment = [(row as { comment?: string }).comment, b.text].filter(Boolean).join(" ");
    }
    for (const r of parsed as ((typeof parsed)[number] & { comment?: string })[]) {
      const comment = (r.comment ?? "").replace(/\s+/g, " ").replace(/(\w)- (\w)/g, "$1-$2").trim();
      // "(b. 1967) diagnosed at age 45; …": the note in front describes the relative.
      const note = comment.match(/^\(((?:b|d)\.\s*\d{2,4}s?|age\s*\d+)\)\s*/i);
      const details = note ? comment.slice(note[0].length).replace(/^./, (c) => c.toUpperCase()) : comment;
      for (const relation of [...new Set(r.checked)]) rows.push({ relation: note ? `${relation} (${note[1]})` : relation, diagnosis: r.name, details });
    }
  }
  return rows;
}

export function parseMedicalPages(pages: FormPage[]): MedicalParse {
  const text = pages
    .map((p) =>
      linesOf(p.items)
        .map((l) => l.text)
        .filter((t) => !PAGE_CHROME.test(t))
        .join("\n"),
    )
    .join("\n");
  if (/REP-DNR-F060|CCB Genetic Counselor Comments/.test(text) && !/FAMILY MEMBER/.test(text)) {
    // The older checklist form has no personal health section; the donor's own conditions are its "You" column.
    const empty: HealthRecord = { surgery: null, procedures: null, anesthesia: null, anesthesiaComplications: null, allergies: null, allergyDetails: null, foodIntolerance: null, foodDetails: null };
    return { healthRecord: empty, familyTable: parseChecklist(pages), riskTopics: [] };
  }
  return { healthRecord: parseHealth(text), familyTable: parseFamilyTable(pages), riskTopics: parseRiskTopics(text) };
}
