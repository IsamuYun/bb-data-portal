import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db, eq, exports } from "@bb/db";
import { env } from "@/lib/env";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
const MIME = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf" } as const;

/** Download a finished export file (admin session required). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const [row] = await db().select().from(exports).where(eq(exports.id, id)).limit(1);
  if (!row || row.status !== "done" || !row.filePath) return NextResponse.json({ error: "导出不存在或尚未完成" }, { status: 404 });
  const name = path.basename(row.filePath);
  const abs = path.join(env.EXPORT_DIR, name);
  if (!fs.existsSync(abs)) return NextResponse.json({ error: "文件缺失" }, { status: 404 });
  const { size } = fs.statSync(abs);
  return new NextResponse(fs.createReadStream(abs) as unknown as ReadableStream, {
    headers: {
      "content-type": MIME[row.type],
      "content-length": String(size),
      "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
