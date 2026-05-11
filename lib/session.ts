import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "dev-secret",
);
const COOKIE = "settyflow_session";
const ALG = "HS256";
const TTL_HOURS = 24 * 30; // 30 days

export interface SessionPayload {
  sub: string; // owner email
  name?: string;
}

export async function createSession(payload: SessionPayload) {
  const jwt = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL_HOURS}h`)
    .sign(SECRET);

  const store = await cookies();
  store.set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_HOURS * 3600,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { sub: String(payload.sub ?? ""), name: payload.name as string | undefined };
  } catch {
    return null;
  }
}

export async function readSessionFromRequest(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { sub: String(payload.sub ?? ""), name: payload.name as string | undefined };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE;
