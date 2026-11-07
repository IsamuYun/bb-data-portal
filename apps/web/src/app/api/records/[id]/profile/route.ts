import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { renderProfileHtml } from "@/lib/profile/html";
import { loadProfile, profileFileName } from "@/lib/profile/load";
import { renderProfilePdf } from "@/lib/profile/pdf";

export const runtime = "nodejs";

/** Single-donor profile (Babiology template). `?format=pdf|html`; `&inline=1` opens it in the browser instead of downloading. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "html" ? "html" : "pdf";
  const p = await loadProfile(id);
  if (!p) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  const name = profileFileName(p.model.donorNo, format);
  const disposition = `${url.searchParams.get("inline") ? "inline" : "attachment"}; filename="${name}"`;
  if (format === "html") {
    return new NextResponse(renderProfileHtml(p.model, p.images), { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": disposition, "cache-control": "private, no-store" } });
  }
  const pdf = await renderProfilePdf(p.model, p.images);
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-length": String(pdf.length), "content-disposition": disposition, "cache-control": "private, no-store" } });
}
