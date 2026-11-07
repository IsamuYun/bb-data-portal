import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { detectMapping, parseSpreadsheet } from "@/lib/import/parse";
import { saveImportFile } from "@/lib/import/store";

export const runtime = "nodejs";
const MAX_BYTES = 20 * 1024 * 1024;

/** Step 1 of the import wizard: store the upload, return headers + preview + suggested mapping. */
export async function POST(req: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "文件超过 20MB" }, { status: 413 });
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const sheet = parseSpreadsheet(buf, file.name);
    const token = await saveImportFile(buf, file.name);
    const mapping = detectMapping(sheet.headers, sheet.rows);
    return NextResponse.json({
      token,
      fileName: file.name,
      sheetName: sheet.sheetName,
      headers: sheet.headers,
      rowCount: sheet.rows.length,
      preview: sheet.rows.slice(0, 5),
      mapping,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "解析失败" }, { status: 400 });
  }
}
