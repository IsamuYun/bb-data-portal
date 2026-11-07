import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env";

/** Uploaded import files live inside the media volume so they survive container restarts. */
function importsDir() {
  return path.join(env.MEDIA_DIR, "_imports");
}

const TOKEN_RE = /^[0-9a-f-]{36}\.(xlsx|xls|csv|tsv|txt)$/i;

export async function saveImportFile(buf: Buffer, originalName: string) {
  const ext = (path.extname(originalName).slice(1) || "xlsx").toLowerCase();
  if (!["xlsx", "xls", "csv", "tsv", "txt"].includes(ext)) throw new Error("只支持 xlsx / xls / csv 文件");
  const token = `${randomUUID()}.${ext}`;
  await fs.mkdir(importsDir(), { recursive: true });
  await fs.writeFile(path.join(importsDir(), token), buf);
  return token;
}

export async function readImportFile(token: string) {
  if (!TOKEN_RE.test(token)) throw new Error("无效的文件标识");
  return fs.readFile(path.join(importsDir(), token));
}
