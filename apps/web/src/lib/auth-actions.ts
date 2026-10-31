"use server";

import bcrypt from "bcryptjs";
import { db, eq, users } from "@bb/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie, setSessionCookie } from "./session";

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

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
