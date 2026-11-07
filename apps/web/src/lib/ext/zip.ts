import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export type ExtZip = { file: string; name: string; version: string; size: number; mtime: Date };

/** The newest built extension zip (wxt names them `<name>-<version>-chrome.zip`), or null when none is built. */
export function findExtensionZip(): ExtZip | null {
  const dir = path.resolve(process.cwd(), env.EXT_ZIP_DIR);
  if (!fs.existsSync(dir)) return null;
  const zips = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".zip"))
    .map((name) => {
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      return { file, name, size: st.size, mtime: st.mtime, version: /-(\d+\.\d+\.\d+)-/.exec(name)?.[1] ?? "" };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return zips[0] ?? null;
}
