import { describe, expect, it } from "vitest";
import { annotateForm, widgetsOf, type Box, type FormPage, type TextItem } from "./form";

/** A radio button as the CCB form draws it: 5 overlapping 6.9pt rings, plus a 2pt dot when selected. */
const radio = (x: number, y: number, on: boolean): Box[] => [
  ...[0, 1, 0.5, 1.2, 1].map((d) => ({ x0: x + d * 0.6, y0: y - d * 0.6, x1: x + 5.9 + d * 0.6, y1: y + 5.9 - d * 0.6 })),
  ...(on ? [{ x0: x + 2.5, y0: y + 2, x1: x + 4.4, y1: y + 3.9 }] : []),
];
/** A check box: 4 edges, 4 inner edges, the inside (9 paths, 7.5pt), plus 2 tick paths when checked. */
const box = (x: number, y: number, on: boolean): Box[] => [
  { x0: x, y0: y, x1: x + 0.6, y1: y + 7.5 },
  { x0: x + 0.6, y0: y + 6.9, x1: x + 7.5, y1: y + 7.5 },
  { x0: x + 0.6, y0: y, x1: x + 7.5, y1: y + 0.6 },
  { x0: x + 6.9, y0: y + 0.6, x1: x + 7.5, y1: y + 6.9 },
  { x0: x + 0.6, y0: y + 0.6, x1: x + 1.2, y1: y + 6.9 },
  { x0: x + 1.2, y0: y + 6.3, x1: x + 6.9, y1: y + 6.9 },
  { x0: x + 1.2, y0: y + 0.6, x1: x + 6.9, y1: y + 1.2 },
  { x0: x + 6.3, y0: y + 1.2, x1: x + 6.9, y1: y + 6.3 },
  { x0: x + 1.2, y0: y + 1.2, x1: x + 6.3, y1: y + 6.3 },
  ...(on ? [{ x0: x + 1.8, y0: y + 1, x1: x + 6.2, y1: y + 5.9 }, { x0: x + 1.5, y0: y + 0.5, x1: x + 6.5, y1: y + 6.8 }] : []),
];
const text = (x: number, y: number, str: string): TextItem => ({ str, x, y, w: str.length * 5, h: 9 });

describe("flattened form marks", () => {
  it("groups edge-by-edge boxes into one widget and counts the extra tick paths", () => {
    const ws = widgetsOf([...box(305, 692, false), ...box(305, 678, true), ...radio(95, 572, true)]);
    expect(ws.map((w) => w.paths)).toEqual([9, 11, 6]);
  });

  it("marks selected options in front of their labels; underlines and frames are ignored", () => {
    const page1: FormPage = {
      items: [text(345, 730, "Eye Color:"), text(354, 715, "Black"), text(422, 715, "Brown"), text(63, 332, "Degrees:"), text(243, 332, "B.A."), text(283, 332, "B.S.")],
      paths: [
        { x0: 40, y0: 100, x1: 570, y1: 740 }, // section frame
        { x0: 300, y0: 300, x1: 400, y1: 300.6 }, // fill-in underline
        ...radio(345, 714.6, false),
        ...radio(412.5, 714.6, true),
        ...box(233, 330.6, false),
        ...box(273, 330.6, true),
      ],
    };
    // Page 2 has only selected check boxes; the empty count is learnt over the whole document.
    const page2: FormPage = { items: [text(319, 680, "Building computers")], paths: box(305, 678.5, true) };
    expect(annotateForm([page1, page2])).toEqual(["Eye Color:\n[ ] Black  [x] Brown\nDegrees:  [ ] B.A.  [x] B.S.", "[x] Building computers"]);
  });
});
