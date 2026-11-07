import { readFormPages, type FormPage, type TextItem } from "@/lib/donor-profile/form";

/**
 * Fairfax Genetic Testing PDF: page 1 is Fairfax's own "Genetic Testing Summary" (clean text); the lab reports that
 * follow (Natera, Sema4, Mount Sinai…) vary and often use re-encoded fonts, so only the summary is read.
 *
 * The summary is a three-column table (Genetic Test* | Result | Comments / Donor's Residual Risk**). Columns are
 * split by the header positions; rows by the drawn cell rectangles of the first column (line spacing alone cannot
 * tell rows apart in the newer layouts), falling back to vertical gaps when a PDF has no drawn cells. Output follows the cryobank GTS fields — `gtsCarriers: []` = none found, `null` = not extracted —
 * so the profile's carrier block works unchanged; every row is kept in `geneticTests`.
 */
export const FAIRFAX_GENETIC_PARSER_VERSION = 3;

export type GeneticTest = { section: string; test: string; result: string; comments: string };
export type FairfaxGenetic = {
  geneticTests: GeneticTest[];
  geneticUpdated: string | null;
  jewishAncestry: string | null;
  gtsPanel: string | null;
  gtsCarriers: FairfaxCarrier[] | null;
  gtsCarrierDiseases: string[] | null;
  geneticParserVersion: number;
};

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\s*[‐‑]\s*/g, "-").trim();
const ROW_GAP = 16; // pt between lines of different rows (lines within a row are ~11pt apart)

type Line = { y: number; cols: [string[], string[], string[]] };

/** Rows of the summary table on page 1. */
export function summaryRows(page: FormPage): GeneticTest[] {
  const items = page.items.filter((i) => i.str.trim());
  const header = items.find((i) => /^Genetic Test\*?$/.test(i.str.trim()));
  const result = items.find((i) => header && /^Result$/.test(i.str.trim()) && Math.abs(i.y - header.y) < 3);
  const comments = items.find((i) => header && /^Comments/.test(i.str.trim()) && Math.abs(i.y - header.y) < 3);
  if (!header || !result || !comments) return [];
  const foot = items.find((i) => /^\*\s*No single test/.test(i.str.trim()));
  // Body: below the header (and its second line, "Donor's Residual Risk**"), above the footnotes.
  const below = items.filter((i) => i.y < header.y - 3 && (!foot || i.y > foot.y + 3));
  // Without drawn cells, skip the header's second line ("Donor's Residual Risk**") by distance.
  const body = below.filter((i) => i.y < header.y - 14);
  const col = (i: TextItem): 0 | 1 | 2 => (i.x < result.x - 8 ? 0 : i.x < comments.x - 8 ? 1 : 2);

  const rows = cellRows(page, header, result, below) ?? gapRows(body);
  const split = (its: TextItem[]) => {
    const lines: Line[] = [];
    for (const it of [...its].sort((a, b) => b.y - a.y || a.x - b.x)) {
      let l = lines.find((x) => Math.abs(x.y - it.y) <= 2);
      if (!l) lines.push((l = { y: it.y, cols: [[], [], []] }));
      l.cols[col(it)].push(it.str);
    }
    return lines.sort((a, b) => b.y - a.y);
  };
  const cells = rows.map((its) => {
    const lines = split(its);
    return { test: lines.map((l) => l.cols[0].join(" ")), result: lines.map((l) => l.cols[1].join(" ")), comments: lines.map((l) => l.cols[2].join(" ")) };
  });

  const out: GeneticTest[] = [];
  let section = "";
  for (const r of cells) {
    const t = { test: norm(r.test.join(" ")), result: norm(r.result.join(" ")), comments: norm(r.comments.join(" ")) };
    if (!t.test && out.length) {
      // A trailing comment ("Partner testing is not recommended.") belongs to the row above.
      const last = out[out.length - 1];
      if (t.result) last.result = norm(`${last.result} ${t.result}`);
      if (t.comments) last.comments = norm(`${last.comments} ${t.comments}`);
    } else if (t.test && !t.result && !t.comments) section = t.test; // "Special Testing"
    else if (t.test) {
      const note = t.test.match(RESIDUAL_NOTE)?.[0];
      if (note && t.test.replace(RESIDUAL_NOTE, "")) {
        t.test = norm(t.test.replace(RESIDUAL_NOTE, ""));
        t.comments = norm(`${t.comments} ${note}`);
      }
      out.push({ section, ...t });
    }
  }
  return out;
}

/** Items grouped by the first-column cell rectangles below the header (null when the page draws none). */
function cellRows(page: FormPage, header: TextItem, result: TextItem, body: TextItem[]): TextItem[][] | null {
  const seen = new Set<string>();
  const bands = page.paths
    .filter((b) => Math.abs(b.x0 - header.x) < 12 && b.x1 < result.x && b.x1 - b.x0 > 50 && b.y1 - b.y0 > 3 && b.y0 < header.y - 3 && !(b.y0 <= header.y && header.y <= b.y1))
    .filter((b) => {
      const k = `${Math.round(b.y0)}:${Math.round(b.y1)}`;
      return !seen.has(k) && (seen.add(k), true);
    })
    .sort((a, b) => b.y1 - a.y1);
  if (!bands.length) return null;
  const rows = bands.map(() => [] as TextItem[]);
  for (const it of body) {
    const i = bands.findIndex((b) => it.y >= b.y0 - 1 && it.y <= b.y1 + 1);
    if (i >= 0) rows[i].push(it);
  }
  return rows.filter((r) => r.length);
}

/** Fallback for PDFs without drawn cells: a new row after a vertical gap. */
function gapRows(body: TextItem[]): TextItem[][] {
  const rows: TextItem[][] = [];
  let prevY = Infinity;
  for (const it of [...body].sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (prevY - it.y > ROW_GAP || !rows.length) rows.push([]);
    rows[rows.length - 1].push(it);
    prevY = it.y;
  }
  return rows;
}

/** "Expanded Genetic Disease Carrier Screening Panel attached - 549 diseases by gene sequencing…" → "… Panel (549 diseases)". */
export function panelName(test: string): string {
  const n = test.match(/(\d+)\s*diseases/i)?.[1];
  const name = norm(test.replace(/\s*(attached\b|:|[-–]\s*\d).*$/i, "").replace(/[-–:]\s*$/, ""));
  return n ? `${name} (${n} diseases)` : name;
}

const PANEL = /\d+\s*diseases/i;
/** A note Fairfax prints under the panel name; it belongs with the comments. */
const RESIDUAL_NOTE = /\s*Personalized residual risk by gene is in the attached report\.?/i;
/** A result that reports nothing to follow up (karyotype, hemoglobin, single-gene and panel tests). */
const CLEAR = /^(negative|normal|non[- ]?carrier|no carrier mutations|no diagnostic sequence|no pathogenic|not detected)\b/i;
/** Start of one finding: "Carrier:", "Silent Carrier:", "Possible Carrier:", "Increased Carrier Risk:", "Increased Risk of being a Carrier of". */
const FINDING = /\b(?:(Silent|Possible)\s+Carrier\s*:|(Increased\s+Carrier\s+Risk)\s*:|(Increased\s+Risk\s+of\s+being\s+a\s+Carrier)\s+of\b|Carrier\s*:)/gi;
/** Where the list of findings ends. */
const TAIL = /\s*\(?\s*(?:Negative for (?:all |other )?genes\b.*|see (?:the )?report attached.*|see DNA results.*)$/i;
const GENE = /^[A-Z][A-Z0-9]{1,9}(?:\s*[/,]\s*[A-Z][A-Z0-9]{1,9})*$/;

export type FairfaxCarrier = { gene: string; disease: string; result: string; variant: string };

/** One finding's text ("Prolidase deficiency (PEPD)", "Alpha Thalassemia (HBA1/HBA2) Silent carrier aa/-a") → fields. */
export function parseFinding(text: string, result: string): FairfaxCarrier {
  let t = norm(text).replace(/[.;,]\s*$/, "");
  let gene = "";
  let variant = "";
  // The gene is the last parenthesised group that looks like a gene symbol; whatever follows it is a variant note.
  const groups = [...t.matchAll(/\(([^()]+)\)/g)];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    const sym = g[1].replace(/[-\s]*related$/i, "").trim();
    if (GENE.test(sym)) {
      gene = sym.replace(/\s*\/\s*/g, "/").replace(/\s*,\s*/g, ", ");
      variant = t.slice(g.index! + g[0].length).replace(/^[\s\-–]+/, "").trim();
      t = t.slice(0, g.index).trim();
      break;
    }
  }
  if (!gene) {
    // "…, GJB2 related", "ERCC6-Related Disorders", "Spinal Muscular Atrophy: SMN1 Linked", "…in the HBA1 and HBA2 genes"
    const m = t.match(/\b([A-Z][A-Z0-9]{2,})\s*-?\s*(?:[Rr]elated|[Ll]inked)\b/) ?? t.match(/\b([A-Z]{2,}\d[A-Z0-9]*)\b/);
    if (m) gene = m[1];
  }
  const disease = norm(t.replace(/\s*-\s*$/, "").replace(/\s+-\s+/g, "-").replace(/:\s*$/, ""));
  variant = norm(variant);
  return { gene, disease, result, variant: variant === gene ? "" : variant };
}

/** Findings in one result cell ("Carrier: A (G1) Carrier: B (G2) Negative for other genes sequenced."). */
export function findingsOf(result: string): FairfaxCarrier[] {
  const marks = [...result.matchAll(FINDING)];
  return marks.map((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index! : result.length;
    const kind = m[1] ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} Carrier` : m[2] || m[3] ? "Increased Carrier Risk" : "Carrier";
    return parseFinding(result.slice(m.index! + m[0].length, end).replace(TAIL, ""), kind);
  });
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/**
 * The hemoglobin row often names a carrier status ("Carrier: Alpha Thalassemia") that the panel then reports with its
 * gene: keep the panel's finding only.
 */
function dedupe(found: FairfaxCarrier[]): FairfaxCarrier[] {
  return found.filter((c) => c.disease && (c.gene || !found.some((o) => o !== c && o.gene && key(o.disease).startsWith(key(c.disease)))));
}

export function fairfaxGeneticFromPages(pages: FormPage[]): FairfaxGenetic {
  const page = pages[0];
  const rows = page ? summaryRows(page) : [];
  const text = page ? page.items.map((i) => i.str).join("\n") : "";
  const updated = text.match(/Last Updated:\s*([0-9/.-]+)/i)?.[1] ?? null;
  const jewish = text.match(/Jewish Ancestry:\s*(Yes|No|Unknown)\b/i)?.[1] ?? null;
  const panel = rows.find((r) => PANEL.test(r.test));
  // Findings anywhere in the table (the panel, hemoglobin evaluation, special testing). With none, "no carriers" needs
  // every row to read as clear; a wording not seen yet leaves the block for manual review instead of being guessed.
  const carriers = dedupe(rows.flatMap((r) => findingsOf(r.result)));
  const clear = rows.length > 0 && rows.every((r) => CLEAR.test(r.result));
  const found = carriers.length ? carriers : clear ? [] : null;
  return {
    geneticTests: rows,
    geneticUpdated: updated,
    jewishAncestry: jewish,
    gtsPanel: panel ? panelName(panel.test) : null,
    gtsCarriers: found,
    gtsCarrierDiseases: found ? found.map((c) => c.disease) : null,
    geneticParserVersion: FAIRFAX_GENETIC_PARSER_VERSION,
  };
}

export async function fairfaxGeneticFromPdf(bytes: Uint8Array): Promise<FairfaxGenetic> {
  // Page 1 only: the lab reports behind the summary can run to 40 pages.
  return fairfaxGeneticFromPages(await readFormPages(bytes, 1));
}
