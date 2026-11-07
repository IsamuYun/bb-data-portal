"use server";

import bcrypt from "bcryptjs";
import { db, eq, users } from "@bb/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie, getSessionUser, setSessionCookie } from "./session";

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "请输入有效的邮箱和密码" };
  const [user] = await db().select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return { error: "邮箱或密码错误" };
  }
  await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role });
  redirect("/");
}

export type PasswordState = { error?: string; ok?: boolean } | undefined;

/** Change the signed-in user's password (current password required, new one ≥ 8 chars). */
export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 8) return { error: "新密码至少 8 个字符" };
  if (next !== confirm) return { error: "两次输入的新密码不一致" };
  const [user] = await db().select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { error: "当前密码错误" };
  await db().update(users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(users.id, me.id));
  return { ok: true };
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
