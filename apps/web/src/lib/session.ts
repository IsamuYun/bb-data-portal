import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { env } from "./env";

export const SESSION_COOKIE = "bb_session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

export type SessionUser = { id: string; email: string; name: string; role: string };

const key = () => new TextEncoder().encode(env.AUTH_SECRET);

export async function signSession(user: SessionUser) {
  return new SignJWT({ u: user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return (payload.u as SessionUser) ?? null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && env.APP_URL.startsWith("https"),
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Memoised per request. */
export const getSessionUser = cache(async () => {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
});
