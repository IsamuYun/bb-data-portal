import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db, devices, eq } from "@bb/db";

export type Device = typeof devices.$inferSelect;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => "bbd_" + randomBytes(24).toString("base64url");
export const newPairingCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(6);
  return Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
};

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Resolve the device from the Bearer token; bumps lastSeenAt. Revoked devices are rejected. */
export async function authDevice(req: Request): Promise<Device | NextResponse> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return fail("缺少设备 token", 401);
  const d = db();
  const [dev] = await d.select().from(devices).where(eq(devices.tokenHash, hashToken(token))).limit(1);
  if (!dev) return fail("设备 token 无效", 401);
  if (dev.status === "revoked") return fail("设备已被吊销", 403);
  await d.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, dev.id));
  return dev;
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;

export async function parseBody<T>(req: Request, schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } }): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success || r.data === undefined) {
    const i = r.error?.issues[0];
    return fail(i ? `${i.path.join(".")}: ${i.message}` : "请求无效");
  }
  return r.data;
}
