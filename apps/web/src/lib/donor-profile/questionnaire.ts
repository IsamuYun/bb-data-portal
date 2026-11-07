/**
 * Field extraction from the cryobank social questionnaire (CCB-FORM-0259, the first five "Social Page n of 5" pages of
 * `<no>LP.pdf`), after form.ts has written each page as text with `[x]` / `[ ]` before the options. Pure string work,
 * no model: the form is fixed, so every answer is found next to its printed question.
 */

export type Questionnaire = {
  hsYears: string | null;
  hsGpa: string | null;
  collegeYears: string | null;
  collegeGpa: string | null;
  majors: string | null;
  minors: string | null;
  /** Checked degrees, e.g. ["B.S.", "M.D."]. */
  degrees: string[];
  gradYears: string | null;
  gradGpa: string | null;
  gradFocus: string | null;
  otherDegrees: string | null;
  mechanicalSkills: string[];
  mechanicalOther: string | null;
  mathSkills: string | null;
  academicAwards: string | null;
  athleticLevel: string | null;
  athleticAwards: string | null;
  favoriteSport: string | null;
  sportsPlayed: string[];
  sportsOther: string | null;
  languages: string[];
  languagesOther: string | null;
  hobbies: string | null;
  creativity: string | null;
  favoriteFoods: string | null;
  favoriteAnimal: string | null;
  travelWish: string | null;
  oneThing: string | null;
  favoriteSubject: string | null;
  clubs: string | null;
  honors: string | null;
  fullTimeStudent: string | null;
  occupation: string | null;
  pastJobs: string | null;
  military: string | null;
};

type Cell = { on: boolean | null; text: string };

/** A line's cells (columns are two or more spaces apart); `on` is the box state, null for plain text. */
export function cellsOf(line: string): Cell[] {
  return line
    .split(/\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const m = c.match(/^\[(x| )\]\s*(.*)$/);
      return m ? { on: m[1] === "x", text: m[2].trim() } : { on: null, text: c };
    });
}

const hasBoxes = (line: string) => cellsOf(line).some((c) => c.on !== null);
const EMPTY = /^(n\/?a|none|no|-+|\.)$/i;
/** Free-text answer, or null for blanks and "N/A". `keepNone` keeps "None" (e.g. honors: none is an answer). */
const answer = (s: string | undefined | null, keepNone = false): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (EMPTY.test(t) && !(keepNone && /^none$/i.test(t))) return null;
  return t;
};

/** Every question/label that starts a new answer; prose answers stop at the next one. */
const ANCHORS = [
  /^Donor # \d+/,
  /^(DONOR PROFILE|HOBBIES, FAVORITES|EDUCATIONAL AND OCCUPATIONAL|PHYSICAL QUALITIES)/,
  /^What kind of mechanical skills/,
  /^How are your mathematical skills/,
  /^Awards or Honors:/,
  /^Are you athletic\?/,
  /^What is your favorite sport/,
  /^Which sport\(s\)/,
  /^What languages do you speak/,
  /^What are your hobbies/,
  /^How do you express your creativity/,
  /^What are your favorite foods/,
  /^What is your favorite animal/,
  /^Where would you like to travel/,
  /^What makes you laugh/,
  /^What is the one thing/,
  /^Which subject did you/,
  /^Academic and professional/,
  /^Are you a full-time student/,
  /^If you are not a full-time student/,
  /^Current\/Past jobs/,
  /^Have you served in the military/,
];
const isAnchor = (line: string) => ANCHORS.some((re) => re.test(line));

export class FormText {
  readonly lines: string[];
  constructor(pages: string[]) {
    this.lines = pages
      .join("\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/Proprietary document|^CCB-FORM-\d+|Unauthorized use or distribu/i.test(l));
  }

  find(re: RegExp, from = 0): number {
    for (let i = from; i < this.lines.length; i++) if (re.test(this.lines[i])) return i;
    return -1;
  }

  /** Cells of the box lines right after line `i` (stops at the first line without boxes). */
  options(i: number): Cell[] {
    const out: Cell[] = [];
    for (let j = i + 1; j < this.lines.length && hasBoxes(this.lines[j]); j++) out.push(...cellsOf(this.lines[j]));
    return out;
  }

  /**
   * Answer to the question on line `i`: the rest of that line after the question cell(s), then the following lines
   * up to the next question. Questions printed over two lines end at the line with the "?".
   */
  prose(i: number): string | null {
    if (i < 0) return null;
    let q = i;
    while (q < this.lines.length - 1 && !/[?:]/.test(this.lines[q]) && q - i < 2) q++;
    const rest = cellsOf(this.lines[q])
      .slice(1)
      .map((c) => c.text);
    const parts = [...rest];
    for (let j = q + 1; j < this.lines.length && !isAnchor(this.lines[j]) && !hasBoxes(this.lines[j]); j++) parts.push(this.lines[j]);
    return parts.join(" ");
  }

  /** Text after `label` on its own line (same cell or the next cell). */
  inline(re: RegExp, from = 0): { value: string | null; at: number } {
    const at = this.find(re, from);
    if (at < 0) return { value: null, at };
    const cells = cellsOf(this.lines[at]);
    const k = cells.findIndex((c) => re.test(c.text));
    const own = cells[k].text.replace(re, "").trim();
    return { value: own || cells[k + 1]?.text || null, at };
  }
}

const checked = (cells: Cell[]) => cells.filter((c) => c.on).map((c) => c.text);
const stripExample = (s: string) => s.replace(/\s*\(e\.g\..*$/i, "").replace(/\s*\(Can .*$/i, "").trim();
/** "Other: Lacrosse" among the options → "Lacrosse" (only when that box is checked). */
const otherText = (cells: Cell[]) => answer(cells.find((c) => c.on && /^Other:?/i.test(c.text))?.text.replace(/^Other:?\s*/i, ""));
const withoutOther = (xs: string[]) => xs.filter((x) => !/^Other:?/i.test(x));

/** "High School  [ ] 1 … [x] 4  GPA:  3.9" → years "4", GPA "3.9" (+ "Major/Focus: …" on the graduate line). */
function studyLine(form: FormText, re: RegExp) {
  const at = form.find(re);
  if (at < 0) return { years: null, gpa: null, focus: null };
  const cells = cellsOf(form.lines[at]);
  const years = cells.find((c) => c.on && /^\d\+?$/.test(c.text))?.text ?? null;
  const g = cells.findIndex((c) => /^GPA:/.test(c.text));
  const gpa = g < 0 ? null : answer(cells[g].text.replace(/^GPA:\s*/, "") || (cells[g + 1] && !/:/.test(cells[g + 1].text) ? cells[g + 1].text : ""));
  const focus = answer(cells.find((c) => /^Major\/Focus:/.test(c.text))?.text.replace(/^Major\/Focus:\s*/, ""));
  return { years, gpa, focus };
}

export function parseQuestionnaire(pages: string[]): Questionnaire {
  const form = new FormText(pages);

  const hs = studyLine(form, /^High School\b/);
  const college = studyLine(form, /^College\/University\s+\[/);
  const grad = studyLine(form, /^Graduate Studies\b/);

  const majorAt = form.find(/^Major\(s\):/);
  const majorCells = majorAt < 0 ? [] : cellsOf(form.lines[majorAt]);
  const majors = answer(majorCells.find((c) => /^Major\(s\):/.test(c.text))?.text.replace(/^Major\(s\):\s*/, ""));
  const minors = answer(majorCells.find((c) => /^Minor\(s\):/.test(c.text))?.text.replace(/^Minor\(s\):\s*/, ""));

  const degreeLines = [form.find(/^College\/University degrees attained/), form.find(/^Graduate degrees attained/)];
  const degrees = degreeLines.flatMap((i) => (i < 0 ? [] : checked(cellsOf(form.lines[i])).filter((d) => !/^Other/i.test(d))));
  const otherDegrees = answer(form.inline(/^Other degrees\/certifications:\s*/).value);

  const mech = form.options(form.find(/^What kind of mechanical skills/));
  const mathAt = form.find(/^How are your mathematical skills/);
  const math = form.options(mathAt);
  const athleticAt = form.find(/^Are you athletic\?/);
  const athletic = form.options(athleticAt);
  const sports = form.options(form.find(/^Which sport\(s\)/));
  const langs = form.options(form.find(/^What languages do you speak/));

  const fullTimeLine = form.lines.find((l) => {
    const c = cellsOf(l);
    return c.length === 3 && c[0].text === "Yes" && c[1].text === "No" && /^Part-time/.test(c[2].text);
  });
  const militaryAt = form.find(/^Have you served in the military/);
  const military = militaryAt < 0 ? null : (checked(form.options(militaryAt))[0] ?? null);

  const subject = form.find(/^Which subject did you\s+most/);

  return {
    hsYears: hs.years,
    hsGpa: hs.gpa,
    collegeYears: college.years,
    collegeGpa: college.gpa,
    majors,
    minors,
    degrees,
    gradYears: grad.years,
    gradGpa: grad.gpa,
    gradFocus: grad.focus,
    otherDegrees,
    mechanicalSkills: withoutOther(checked(mech)),
    mechanicalOther: otherText(mech),
    mathSkills: checked(math).map(stripExample)[0] ?? null,
    academicAwards: answer(form.inline(/^Awards or Honors:\s*/, mathAt).value, true),
    athleticLevel: checked(athletic).map(stripExample)[0] ?? null,
    athleticAwards: answer(form.inline(/^Awards or Honors:\s*/, athleticAt).value, true),
    favoriteSport: answer(form.prose(form.find(/^What is your favorite sport/))),
    sportsPlayed: withoutOther(checked(sports)).filter((s) => !/^None$/i.test(s)),
    sportsOther: otherText(sports),
    languages: withoutOther(checked(langs)),
    languagesOther: otherText(langs),
    hobbies: answer(form.prose(form.find(/^What are your hobbies/))),
    creativity: answer(form.prose(form.find(/^How do you express your creativity/))),
    favoriteFoods: answer(form.prose(form.find(/^What are your favorite foods/))),
    favoriteAnimal: answer(form.prose(form.find(/^What is your favorite animal/))),
    travelWish: answer(form.prose(form.find(/^Where would you like to travel/))),
    oneThing: answer(form.prose(form.find(/^What is the one thing/))),
    favoriteSubject: subject < 0 ? null : answer(cellsOf(form.lines[subject]).slice(-1)[0]?.text.replace(/^.*enjoy in school\?\s*/, "")),
    clubs: answer(form.prose(form.find(/^Academic and professional clubs/)), true),
    honors: answer(form.prose(form.find(/^Academic and professional honors/)), true),
    fullTimeStudent: fullTimeLine ? (checked(cellsOf(fullTimeLine))[0] ?? null) : null,
    occupation: answer(form.prose(form.find(/^If you are not a full-time student/))),
    pastJobs: answer(form.prose(form.find(/^Current\/Past jobs/))),
    military,
  };
}
