import { and, db, devices, eq, gt, isNull, pairingCodes } from "@bb/db";
import { registerRequest } from "@bb/shared";
import { fail, hashToken, isResponse, json, newToken, parseBody } from "@/lib/ext/auth";

export const runtime = "nodejs";

/** Exchange a one-time pairing code (from the Devices page) for a device token. */
export async function POST(req: Request) {
  const body = await parseBody(req, registerRequest);
  if (isResponse(body)) return body;
  const d = db();
  const code = body.pairingCode.trim().toUpperCase();
  const token = newToken();
  const result = await d.transaction(async (tx) => {
    const [pc] = await tx
      .select()
      .from(pairingCodes)
      .where(and(eq(pairingCodes.code, code), isNull(pairingCodes.usedAt), gt(pairingCodes.expiresAt, new Date())))
      .limit(1);
    if (!pc) return null;
    const [dev] = await tx
      .insert(devices)
      .values({ name: body.name.trim(), tokenHash: hashToken(token), chromeVersion: body.chromeVersion, extVersion: body.extVersion, lastSeenAt: new Date() })
      .returning({ id: devices.id, name: devices.name });
    await tx.update(pairingCodes).set({ usedAt: new Date(), usedByDeviceId: dev.id }).where(eq(pairingCodes.id, pc.id));
    return dev;
  });
  if (!result) return fail("配对码无效或已过期", 400);
  return json({ deviceId: result.id, token, name: result.name });
}
