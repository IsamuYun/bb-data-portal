import { getSessionUser, type SessionUser } from "./session";

/** Every server action / route handler must call this: actions are reachable by direct POST. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("未登录");
  return user;
}
