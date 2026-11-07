/**
 * Parser for the Baylor Genetics "GeneAware Expanded Plus Panel" carrier-screening report that cryobank serves as a
 * donor's GTS PDF. Works on positioned text items (pdf.js `getTextContent`), not on raw bytes, so it is pure and testable.
 *
 * Layout of the "Results Summary" table (page 1, may continue on the next page):
 *   Disease / Gene / Risk Details                         Donor 19161        ← column header; right column x = result column
 *   Nonsyndromic hearing loss, GJB2-related               CARRIER            ← row start: disease | result
 *   GJB2  - Reproductive Risk: 1 in 170                   c.109G>A (p.V37I)  ← gene + risk | variant
 *   Inheritance Pattern: Autosomal recessive              Heterozygous       ← inheritance | zygosity
 *       This individual is a heterozygous carrier ...                        ← indented interpretation (ignored)
 * The table ends at "Comments" / "Additional Results Summary".
 */

export type PdfTextItem = { str: string; x: number; y: number };
export type GeneAwareCarrier = {
  gene: string;
  disease: string;
  /** As printed: "CARRIER", "SILENT CARRIER" ... */
  result: string;
  variant: string;
  zygosity: string;
  inheritance: string;
  reproductiveRisk: string;
};
export type GeneAwareSummary = {
  /** Panel title as printed, e.g. "GeneAware Expanded Plus Panel (445 genes)". */
  panel: string;
  /** Overall panel result printed next to the title, e.g. "CARRIER". */
  overall: string;
  carriers: GeneAwareCarrier[];
};

type Line = { y: number; items: PdfTextItem[]; text: string };

const PANEL = /GeneAware Expanded Plus Panel/i;
const SUMMARY = /^Results? Summary$/i;
const COLUMN_HEADER = /^Disease \/ Gene \/ Risk Details/i;
const TABLE_END = /^(Comments|Additional Results Summary|Interpretation|Methodology|Recommendations?)$/i;
const FOOTER = /^Sample Type:|Page \d+\s*\/\s*\d+/i;
const ZYGOSITY = /^(Heterozygous|Homozygous|Hemizygous|Compound heterozygous|Heteroplasmic|Homoplasmic)\b/i;
const RESULT = /^[A-Z][A-Z ()\-/]+$/;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Group a page's items into visual lines (top to bottom, left to right). */
export function toLines(items: PdfTextItem[], tolerance = 2): Line[] {
  const lines: Line[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tolerance);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it], text: "" });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = clean(l.items.map((i) => i.str).join(" "));
  }
  return lines.sort((a, b) => b.y - a.y);
}

const textOf = (items: PdfTextItem[]) => clean(items.map((i) => i.str).join(" "));

/** Extract the Results Summary of the GeneAware Expanded Plus Panel; null when the report has no such panel/table. */
export function parseGeneAware(pages: PdfTextItem[][]): GeneAwareSummary | null {
  const pageLines = pages.map((p) => toLines(p));

  // Locate the panel title and, after it, the "Results Summary" heading.
  let panel = "";
  let overall = "";
  let start: { page: number; line: number } | null = null;
  outer: for (const [pi, lines] of pageLines.entries()) {
    for (const [li, l] of lines.entries()) {
      if (!panel && PANEL.test(l.text)) {
        const resultItem = l.items.find((i) => RESULT.test(clean(i.str)) && !PANEL.test(i.str));
        panel = textOf(l.items.filter((i) => i !== resultItem));
        overall = resultItem ? clean(resultItem.str) : "";
      } else if (panel && SUMMARY.test(l.text)) {
        start = { page: pi, line: li };
        break outer;
      }
    }
  }
  if (!panel || !start) return null;

  // Walk the table rows, continuing onto following pages until an end heading.
  type Row = { disease: string[]; result: string; left: string[]; right: string[]; rowX: number };
  const rows: Row[] = [];
  let colX: number | null = null;
  let ended = false;
  for (let pi = start.page; pi < pageLines.length && !ended; pi++) {
    const lines = pageLines[pi];
    const footerY = Math.max(-Infinity, ...lines.filter((l) => FOOTER.test(l.text)).map((l) => l.y));
    let i = pi === start.page ? start.line + 1 : 0;
    if (pi !== start.page) {
      // A continuation page repeats the column header; without it the table did not continue.
      const h = lines.findIndex((l) => COLUMN_HEADER.test(l.text));
      if (h < 0) break;
      i = h;
    }
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (l.y <= footerY) break;
      if (TABLE_END.test(l.text)) {
        ended = true;
        break;
      }
      if (COLUMN_HEADER.test(l.text)) {
        const right = l.items.length > 1 ? l.items[l.items.length - 1] : null;
        if (right && colX == null) colX = right.x;
        continue;
      }
      if (colX == null) continue;
      const left = l.items.filter((it) => it.x < colX! - 10);
      const right = l.items.filter((it) => it.x >= colX! - 10);
      const leftText = textOf(left);
      const rightText = textOf(right);
      const cur = rows[rows.length - 1];
      const startsRow = rightText && RESULT.test(rightText) && !ZYGOSITY.test(rightText) && leftText && !/Reproductive Risk|Inheritance Pattern/i.test(leftText);
      if (startsRow) {
        rows.push({ disease: [leftText], result: rightText, left: [], right: [], rowX: left[0]?.x ?? 0 });
        continue;
      }
      if (!cur) continue;
      // Indented prose under a row is the lab's interpretation — not part of the structured row.
      const indented = left.length > 0 && left[0].x > cur.rowX + 8 && !rightText;
      if (indented) continue;
      if (leftText) {
        if (cur.left.length === 0 && !/Reproductive Risk|Inheritance Pattern/i.test(leftText) && !isGeneLine(left)) cur.disease.push(leftText);
        else cur.left.push(leftText);
      }
      if (rightText) cur.right.push(rightText);
    }
  }

  const carriers = rows
    .filter((r) => /CARRIER/i.test(r.result))
    .map((r): GeneAwareCarrier => {
      const geneLine = r.left.find((t) => /Reproductive Risk/i.test(t)) ?? r.left[0] ?? "";
      const inh = r.left.find((t) => /Inheritance Pattern/i.test(t)) ?? "";
      return {
        // "GJB2 - Reproductive Risk: …"; pdf.js may merge the gene and the dash into one item ("GJB2- Reproductive …").
        gene: clean(geneLine.replace(/\s*-?\s*Reproductive Risk.*$/i, "")).replace(/\s*-$/, ""),
        disease: clean(r.disease.join(" ")),
        result: r.result,
        variant: r.right.filter((t) => !ZYGOSITY.test(t)).join("; "),
        zygosity: r.right.filter((t) => ZYGOSITY.test(t)).join("; "),
        inheritance: clean(inh.replace(/^.*Inheritance Pattern:\s*/i, "")),
        reproductiveRisk: clean((geneLine.match(/Reproductive Risk:\s*(.*)$/i)?.[1] ?? "")),
      };
    });
  return { panel, overall, carriers };
}

/** Title of the first GeneAware panel in the report (any panel, e.g. "GeneAware Comprehensive+ (611)"), for reporting. */
export function findGeneAwarePanel(pages: PdfTextItem[][]): string | null {
  for (const p of pages) {
    for (const l of toLines(p)) {
      if (!/^GeneAware\b/i.test(l.text)) continue;
      const result = l.items.find((i) => RESULT.test(clean(i.str)) && !/GeneAware/i.test(i.str));
      return textOf(l.items.filter((i) => i !== result));
    }
  }
  return null;
}

/** "GJB2" alone at the row's left edge (risk text sometimes sits in a separate item on the same line). */
function isGeneLine(left: PdfTextItem[]) {
  return /^[A-Z0-9][A-Z0-9-]{1,14}$/.test(clean(left[0]?.str ?? ""));
}
