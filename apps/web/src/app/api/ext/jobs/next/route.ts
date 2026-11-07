import type { NextJobResponse } from "@bb/shared";
import { authDevice, isResponse, json } from "@/lib/ext/auth";
import { leaseNextJob } from "@/lib/ext/lease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const dev = await authDevice(req);
  if (isResponse(dev)) return dev;
  if (dev.status !== "active") {
    const res: NextJobResponse = { job: null, recipe: null, deviceStatus: dev.status };
    return json(res);
  }
  // Optional `?platforms=a,b` restricts which platforms this device will work on.
  const platforms = (new URL(req.url).searchParams.get("platforms") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const leased = await leaseNextJob(dev.id, platforms.length ? platforms : undefined);
  if (!leased) return json({ job: null, recipe: null, deviceStatus: "active" } satisfies NextJobResponse);
  const { recipe, ...job } = leased;
  return json({ job, recipe, deviceStatus: "active" } satisfies NextJobResponse);
}
