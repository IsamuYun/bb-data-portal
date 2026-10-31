import { db, sql } from "@bb/db";

export async function GET() {
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
