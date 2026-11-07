"use server";

import { db, devices, eq, jobs, pairingCodes } from "@bb/db";
import { revalidatePath } from "next/cache";
import { newPairingCode } from "../ext/auth";
import { requireUser } from "../require-user";

const PAIRING_TTL_MIN = 15;

export async function createPairingCodeAction() {
  const user = await requireUser();
  const code = newPairingCode();
  await db().insert(pairingCodes).values({ code, expiresAt: new Date(Date.now() + PAIRING_TTL_MIN * 60_000), createdBy: user.id });
  revalidatePath("/devices");
}

export async function setDeviceStatusAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["active", "paused", "revoked"].includes(status)) return;
  await db().update(devices).set({ status: status as "active" | "paused" | "revoked", ...(status !== "active" ? { currentJobId: null } : {}) }).where(eq(devices.id, id));
  // Resuming after a login wall: the jobs that hit it go back to the queue.
  if (status === "active") await db().update(jobs).set({ status: "pending", attempts: 0, lastError: null }).where(eq(jobs.status, "auth_required"));
  revalidatePath("/devices");
  revalidatePath("/jobs");
}

export async function renameDeviceAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  if (!name) return;
  await db().update(devices).set({ name }).where(eq(devices.id, id));
  revalidatePath("/devices");
}

export async function deleteDeviceAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  await db().delete(devices).where(eq(devices.id, id));
  revalidatePath("/devices");
}
