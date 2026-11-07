import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "@/lib/env";
import type { ExportMedia, MediaLoader } from "./types";

/** Read a media file from MEDIA_DIR; missing files yield null so one lost photo never fails an export. */
export const diskMediaLoader: MediaLoader = async (m: ExportMedia) => {
  try {
    return await fs.readFile(path.join(env.MEDIA_DIR, m.path));
  } catch {
    return null;
  }
};

/** Target box: a number is a square of that side; an object is width × height. */
export type JpegSize = number | { width: number; height: number };

/**
 * Normalise any stored image (webp/png/gif/jpeg) to a JPEG fitting `size`. With `cover` the image is
 * cropped (smart position) to fill the box exactly; otherwise it is shrunk to fit inside it.
 * exceljs and react-pdf only embed JPEG/PNG, and webp is what cryobank serves.
 */
export async function toJpeg(buf: Buffer, size: JpegSize, opts: { cover?: boolean } = {}): Promise<Buffer | null> {
  const w = typeof size === "number" ? size : size.width;
  const h = typeof size === "number" ? size : size.height;
  try {
    const img = sharp(buf, { failOn: "none", animated: false }).rotate();
    const resized = opts.cover ? img.resize(w, h, { fit: "cover", position: "attention" }) : img.resize(w, h, { fit: "inside", withoutEnlargement: true });
    return await resized.flatten({ background: "#ffffff" }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }
}

/** Small in-memory cache so the same file is decoded once per export even when several records share it. */
export function cachedJpegs(load: MediaLoader, size: JpegSize, opts: { cover?: boolean } = {}) {
  const cache = new Map<string, Promise<Buffer | null>>();
  return (m: ExportMedia) => {
    let p = cache.get(m.id);
    if (!p) {
      p = load(m).then((b) => (b ? toJpeg(b, size, opts) : null));
      cache.set(m.id, p);
    }
    return p;
  };
}
