import sharp from "sharp";
import { extractImages, getDocumentProxy } from "unpdf";

/**
 * Fairfax "Adult/ Childhood Photo Set" PDFs are one scanned Letter page (2550×3300): logo and title at the top, then
 * each photo inside a coloured frame on white. Only the portraits are wanted, so each framed photo is located on the
 * page, its frame trimmed, and cropped out; logo, title and margins are dropped.
 *
 * Detection works on a small copy of the page: pixels that are not near-white form connected regions; a portrait is
 * a large region that is almost fully filled (text and logos are sparse). The frame is then peeled off edge by edge
 * while the outermost line is one flat colour.
 */
export type Portrait = { jpeg: Buffer; width: number; height: number; /** Box on the page, in page pixels. */ box: { left: number; top: number; width: number; height: number } };

const SCAN = 6; // detection runs on a 1/6 copy (425×550 for a Letter scan)
const WHITE = 232; // a pixel is background when all channels are above this
const MIN_AREA = 0.02; // portrait box ≥ 2% of the page
const MIN_FILL = 0.8; // ≥ 80% of the box is non-white (text / logos are far sparser)
const MAX_SIDE = 1600; // output size limit

type Raw = { data: Buffer; width: number; height: number; channels: number };

function regions(r: Raw) {
  const { data, width: w, height: h, channels: c } = r;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * c;
    ink[i] = data[o] > WHITE && data[o + (c > 1 ? 1 : 0)] > WHITE && data[o + (c > 2 ? 2 : 0)] > WHITE ? 0 : 1;
  }
  const seen = new Uint8Array(w * h);
  const out: { left: number; top: number; right: number; bottom: number; count: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!ink[s] || seen[s]) continue;
    let left = w, top = h, right = 0, bottom = 0, count = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      count++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (n >= 0 && ink[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    out.push({ left, top, right, bottom, count });
  }
  return out;
}

type Box = { left: number; top: number; right: number; bottom: number };

const rgb = (r: Raw, x: number, y: number): [number, number, number] => {
  const o = (y * r.width + x) * r.channels;
  return [r.data[o], r.data[o + (r.channels > 1 ? 1 : 0)], r.data[o + (r.channels > 2 ? 2 : 0)]];
};
const dist = (a: number[], b: number[]) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const chroma = (p: number[]) => Math.max(...p) - Math.min(...p);

/** The frame colour: the first saturated pixel inwards from the middle of each side, when the sides agree. */
function frameColour(r: Raw, b: Box): number[] | null {
  const mx = (b.left + b.right) >> 1, my = (b.top + b.bottom) >> 1;
  const depth = Math.ceil(Math.min(b.right - b.left, b.bottom - b.top) * 0.15);
  const probes: [number, number, number, number][] = [[mx, b.top, 0, 1], [mx, b.bottom, 0, -1], [b.left, my, 1, 0], [b.right, my, -1, 0]];
  const hits: number[][] = [];
  for (const [x0, y0, dx, dy] of probes) {
    for (let i = 0; i < depth; i++) {
      const p = rgb(r, x0 + dx * i, y0 + dy * i);
      if (chroma(p) > 50) {
        hits.push(p);
        break;
      }
    }
  }
  if (hits.length < 3) return null;
  const c = [0, 1, 2].map((k) => hits.map((h) => h[k]).sort((a, b) => a - b)[hits.length >> 1]);
  return hits.filter((h) => dist(h, c) < 50).length >= 3 ? c : null;
}

/**
 * Thickness of shadow + frame on one side: walk inwards line by line; lines before the frame (shadow, margin) are
 * skipped, lines mostly in the frame colour are the frame, the first line after that is the photo.
 */
function sideDepth(r: Raw, b: Box, frame: number[], side: "top" | "bottom" | "left" | "right"): number | null {
  const horizontal = side === "top" || side === "bottom";
  const from = horizontal ? b.left : b.top, to = horizontal ? b.right : b.bottom;
  const limit = Math.ceil((horizontal ? b.bottom - b.top : b.right - b.left) * 0.15);
  const step = Math.max(1, Math.floor((to - from) / 60));
  let inFrame = false;
  for (let i = 0; i < limit; i++) {
    const fixed = side === "top" ? b.top + i : side === "bottom" ? b.bottom - i : side === "left" ? b.left + i : b.right - i;
    let hit = 0, n = 0;
    // Skip the line's ends: corners mix frame, shadow and margin.
    for (let v = from + (to - from) * 0.1; v <= to - (to - from) * 0.1; v += step) {
      const p = horizontal ? rgb(r, Math.round(v), fixed) : rgb(r, fixed, Math.round(v));
      if (dist(p, frame) < 60) hit++;
      n++;
    }
    const frac = hit / Math.max(1, n);
    if (frac >= 0.6) inFrame = true;
    else if (inFrame) return i;
  }
  return null;
}

/** Peel shadow and frame off a detected photo box; sides that disagree are clamped to the others' thickness. */
function trimFrame(r: Raw, b: Box): Box {
  const frame = frameColour(r, b);
  if (!frame) return b;
  const sides = ["top", "bottom", "left", "right"] as const;
  const d = sides.map((s) => sideDepth(r, b, frame, s));
  const known = d.filter((x): x is number => x != null).sort((a, z) => a - z);
  if (!known.length) return b;
  const median = known[known.length >> 1];
  // A side whose "frame" runs on (a photo with a backdrop in the frame colour) or was not found: use the median.
  const fix = d.map((x) => (x == null || x > median * 1.6 + 4 ? median : x));
  return { top: b.top + fix[0], bottom: b.bottom - fix[1], left: b.left + fix[2], right: b.right - fix[3] };
}

/**
 * A region drawn as a closed rectangle (a frame around a pale photo: white wall, white clothes): each side of its
 * box, a little inside the edge, is almost entirely ink. Text lines and logos never are.
 */
function framed(r: Raw, g: Box): boolean {
  const ink = (x: number, y: number) => {
    const p = rgb(r, x, y);
    return !(p[0] > WHITE && p[1] > WHITE && p[2] > WHITE);
  };
  const band = (pts: (i: number) => [number, number], n: number) => {
    let hit = 0;
    for (let i = 0; i < n; i++) if (ink(...pts(i))) hit++;
    return hit / Math.max(1, n);
  };
  const w = g.right - g.left, h = g.bottom - g.top;
  const inset = 2;
  return (
    band((i) => [g.left + inset + i, g.top + inset], w - 2 * inset) > 0.9 &&
    band((i) => [g.left + inset + i, g.bottom - inset], w - 2 * inset) > 0.9 &&
    band((i) => [g.left + inset, g.top + inset + i], h - 2 * inset) > 0.9 &&
    band((i) => [g.right - inset, g.top + inset + i], h - 2 * inset) > 0.9
  );
}

/** Portraits found on one page image, top to bottom (then left to right). */
export async function portraitsFromImage(img: Raw): Promise<Portrait[]> {
  const sw = Math.max(1, Math.round(img.width / SCAN)), sh = Math.max(1, Math.round(img.height / SCAN));
  const small = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels as 1 | 3 | 4 } })
    .resize(sw, sh, { fit: "fill", kernel: "nearest" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const s: Raw = { data: small.data, width: small.info.width, height: small.info.height, channels: small.info.channels };
  const page = s.width * s.height;
  const found = regions(s)
    .map((g) => ({ ...g, area: (g.right - g.left + 1) * (g.bottom - g.top + 1) }))
    .filter((g) => g.area >= page * MIN_AREA && (g.count / g.area >= MIN_FILL || framed(s, g)));

  // Full-resolution copy for the frame trim: inside the photo the frame is a few pixels the small copy blurs.
  const full: Raw = { data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), width: img.width, height: img.height, channels: img.channels };
  const fx = img.width / s.width, fy = img.height / s.height;
  const out: Portrait[] = [];
  for (const g of found.sort((a, b) => a.top - b.top || a.left - b.left)) {
    const rough = {
      left: Math.max(0, Math.floor(g.left * fx)),
      top: Math.max(0, Math.floor(g.top * fy)),
      right: Math.min(img.width - 1, Math.ceil((g.right + 1) * fx) - 1),
      bottom: Math.min(img.height - 1, Math.ceil((g.bottom + 1) * fy) - 1),
    };
    const t = trimFrame(full, rough);
    // Two more pixels in: anti-aliased frame edge.
    const box = { left: t.left + 2, top: t.top + 2, width: t.right - t.left - 3, height: t.bottom - t.top - 3 };
    if (box.width < 50 || box.height < 50) continue;
    const { data, info } = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels as 1 | 3 | 4 } })
      .extract(box)
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    out.push({ jpeg: data, width: info.width, height: info.height, box });
  }
  return out;
}

/** Every portrait of a photo-set PDF, page by page. */
export async function portraitsFromPhotoSet(pdfBytes: Uint8Array): Promise<Portrait[]> {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));
  const out: Portrait[] = [];
  try {
    for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) {
      for (const img of await extractImages(pdf, p)) {
        // Small embedded images are logos / icons; a page-sized scan holds the portraits.
        if (Math.min(img.width, img.height) < 300) continue;
        out.push(...(await portraitsFromImage({ data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), width: img.width, height: img.height, channels: img.channels })));
      }
    }
  } finally {
    await Promise.resolve((pdf as { destroy?: () => Promise<void> }).destroy?.()).catch(() => {});
  }
  return out;
}
