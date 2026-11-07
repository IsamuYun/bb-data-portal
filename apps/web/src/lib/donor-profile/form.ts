import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

/**
 * Flattened PDF forms (cryobank "Extended donor profile", CCB-FORM-0259) have no form fields: radio buttons and
 * check boxes are vector drawings, and a selected one only differs by extra paths (the dot of a radio button, the
 * tick of a check box). This module reads both the text and those drawings and writes each page as plain text with
 * `[x]` / `[ ]` in front of every option label, so a language model (or a regex) can read the answers.
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type TextItem = { str: string; x: number; y: number; w: number; h: number };
export type FormPage = { items: TextItem[]; paths: Box[] };

/** A widget is a cluster of small paths of about this size (pt). */
const WIDGET_MIN = 3.5;
const WIDGET_MAX = 12;

type Widget = Box & { paths: number };

const width = (b: Box) => b.x1 - b.x0;
const height = (b: Box) => b.y1 - b.y0;
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** Group overlapping small paths into widgets (in drawing order, so a widget's tick lands on its box). */
export function widgetsOf(paths: Box[]): Widget[] {
  const out: Widget[] = [];
  for (const p of paths) {
    if (width(p) > WIDGET_MAX || height(p) > WIDGET_MAX) continue;
    // Box outlines are drawn edge by edge, so join on touching bounding boxes, not on centres.
    const hit = out.find((w) => p.x0 <= w.x1 + 1 && p.x1 >= w.x0 - 1 && p.y0 <= w.y1 + 1 && p.y1 >= w.y0 - 1);
    if (hit) {
      const u = union(hit, p);
      if (width(u) <= WIDGET_MAX && height(u) <= WIDGET_MAX) {
        Object.assign(hit, u, { paths: hit.paths + 1 });
        continue;
      }
    }
    out.push({ ...p, paths: 1 });
  }
  return out.filter((w) => width(w) >= WIDGET_MIN && height(w) >= WIDGET_MIN && Math.abs(width(w) - height(w)) < 3);
}

/** Widgets of the same drawing (rounded size) share a path count when empty; more paths = selected. */
const shapeKey = (w: Widget) => `${width(w).toFixed(1)}x${height(w).toFixed(1)}`;

export function emptyCounts(pages: Widget[][]): Map<string, number> {
  const min = new Map<string, number>();
  for (const w of pages.flat()) min.set(shapeKey(w), Math.min(min.get(shapeKey(w)) ?? Infinity, w.paths));
  return min;
}

/**
 * Plain text of one page, top to bottom, with `[x] ` / `[ ] ` before each option label. Text items on the same
 * baseline are joined with two spaces (columns stay apart). The label of a widget is the nearest text item that
 * starts right of it on the same line.
 */
export function annotatePage(page: FormPage, widgets: Widget[], empty: Map<string, number>): string {
  const items = page.items.filter((it) => it.str.trim());
  const marks = new Map<TextItem, boolean>();
  for (const w of widgets) {
    const cy = (w.y0 + w.y1) / 2;
    let best: TextItem | null = null;
    for (const it of items) {
      const mid = it.y + it.h * 0.35;
      if (Math.abs(mid - cy) > 5 || it.x < w.x1 - 1 || it.x > w.x1 + 14) continue;
      if (!best || it.x < best.x) best = it;
    }
    if (best && !marks.has(best)) marks.set(best, w.paths > (empty.get(shapeKey(w)) ?? w.paths));
  }
  const lines = new Map<number, TextItem[]>();
  for (const it of items) {
    const y = [...lines.keys()].find((k) => Math.abs(k - it.y) <= 2) ?? it.y;
    lines.set(y, [...(lines.get(y) ?? []), it]);
  }
  return [...lines.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((it) => (marks.has(it) ? `${marks.get(it) ? "[x]" : "[ ]"} ${it.str.trim()}` : it.str.trim()))
        .join("  "),
    )
    .join("\n");
}

/** Annotate every page of a parsed form; `empty` counts are learnt over the whole document. */
export function annotateForm(pages: FormPage[]): string[] {
  const widgets = pages.map((p) => widgetsOf(p.paths));
  const empty = emptyCounts(widgets);
  return pages.map((p, i) => annotatePage(p, widgets[i], empty));
}

type Matrix = [number, number, number, number, number, number];
const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Text items and the bounding boxes of all drawn paths (PDF user space) of each page. */
export async function readFormPages(bytes: Uint8Array, maxPages = Infinity): Promise<FormPage[]> {
  const { OPS } = await getResolvedPDFJS();
  // pdf.js takes ownership of (detaches) the buffer it is given; hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const pages: FormPage[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      const items = tc.items.flatMap((it) =>
        "str" in it ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, w: it.width, h: it.height }] : [],
      );
      const ops = await page.getOperatorList();
      const paths: Box[] = [];
      let ctm: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] as unknown[];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix);
        else if (fn === OPS.constructPath) {
          const mm = args[2] as ArrayLike<number> | null | undefined;
          if (!mm || mm.length < 4 || !Number.isFinite(mm[0])) continue;
          const [ax, ay] = [ctm[0] * mm[0] + ctm[2] * mm[1] + ctm[4], ctm[1] * mm[0] + ctm[3] * mm[1] + ctm[5]];
          const [bx, by] = [ctm[0] * mm[2] + ctm[2] * mm[3] + ctm[4], ctm[1] * mm[2] + ctm[3] * mm[3] + ctm[5]];
          paths.push({ x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) });
        }
      }
      pages.push({ items, paths });
    }
    return pages;
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
  }
}
