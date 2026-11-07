import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db, eq, media } from "@bb/db";
import { env } from "@/lib/env";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

/** Serve a stored media file to a logged-in admin user. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const [m] = await db().select().from(media).where(eq(media.id, id)).limit(1);
  if (!m) return NextResponse.json({ error: "不存在" }, { status: 404 });
  const abs = path.join(env.MEDIA_DIR, m.path);
  if (!fs.existsSync(abs)) return NextResponse.json({ error: "文件缺失" }, { status: 404 });
  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "content-type": m.mime,
      "content-length": String(m.size),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      // Captured third-party pages (e.g. Fairfax Medical Profile snapshots) open sandboxed: no scripts, no same-origin
      // access to the admin session, no form posts.
      ...(/html|xml|svg/i.test(m.mime) ? { "content-security-policy": "sandbox; default-src 'none'; img-src * data:; style-src * 'unsafe-inline'" } : {}),
    },
  });
}
