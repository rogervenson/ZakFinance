import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/server/db";

export const SESSION_COOKIE = "zf_session";
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Cria a sessão e grava o cookie httpOnly com o token (só o hash fica no banco). */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Sessão válida do cookie atual (ou null). */
export async function readSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, name: true, email: true, mustChangePassword: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}
