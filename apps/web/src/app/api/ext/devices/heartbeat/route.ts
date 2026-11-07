import { db, devices, eq } from "@bb/db";
import { heartbeatRequest, type HeartbeatResponse } from "@bb/shared";
import { authDevice, isResponse, json, parseBody } from "@/lib/ext/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const dev = await authDevice(req);
  if (isResponse(dev)) return dev;
  const body = await parseBody(req, heartbeatRequest);
  if (isResponse(body)) return body;
  await db()
    .update(devices)
    .set({ chromeVersion: body.chromeVersion ?? dev.chromeVersion, extVersion: body.extVersion ?? dev.extVersion, currentJobId: body.currentJobId ?? null })
    .where(eq(devices.id, dev.id));
  const res: HeartbeatResponse = { ok: true, status: dev.status, name: dev.name };
  return json(res);
}
