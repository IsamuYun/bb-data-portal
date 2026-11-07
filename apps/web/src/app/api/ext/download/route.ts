import fs from "node:fs";
import { NextResponse } from "next/server";
import { findExtensionZip } from "@/lib/ext/zip";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

/** Download the built Chrome extension (admin session required). */
export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const zip = findExtensionZip();
  if (!zip) return NextResponse.json({ error: "插件尚未构建；运行 pnpm --filter @bb/extension zip 或重新构建镜像" }, { status: 404 });
  const stream = fs.createReadStream(zip.file);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: { "content-type": "application/zip", "content-length": String(zip.size), "content-disposition": `attachment; filename="${zip.name}"` },
  });
}
