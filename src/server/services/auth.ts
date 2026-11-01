import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/server/auth/password";
import { clientIp, createSession, destroySession } from "@/server/auth/session";
import type { AuthUser } from "@/server/auth/actor";
import { FailureLimiter } from "@/domain/rate-limit";
import { AppError, parseInput } from "@/server/errors";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const MAX_FAILURES_PER_IP = 20;
const INVALID = "E-mail ou senha inválidos.";
const LOCKED = `Muitas tentativas. Tente de novo em ${LOCK_MINUTES} minutos.`;

const globalForLimiter = globalThis as unknown as { loginLimiter?: FailureLimiter };
const ipLimiter = (globalForLimiter.loginLimiter ??= new FailureLimiter(MAX_FAILURES_PER_IP, LOCK_MINUTES * 60_000));

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(150),
  password: z.string().min(1).max(200),
});

/** Entra e informa se a troca de senha é obrigatória. */
export async function login(raw: unknown): Promise<{ mustChangePassword: boolean }> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION", "Informe e-mail e senha.");
  const { email, password } = parsed.data;
  const ip = await clientIp();
  if (ipLimiter.isBlocked(ip)) throw new AppError("UNAUTHENTICATED", LOCKED);

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    ipLimiter.recordFailure(ip);
    await burnPasswordCheck(password);
    throw new AppError("UNAUTHENTICATED", INVALID);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("UNAUTHENTICATED", LOCKED);

  if (!(await verifyPassword(password, user.passwordHash))) {
    ipLimiter.recordFailure(ip);
    const attempts = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: attempts >= MAX_ATTEMPTS ? 0 : attempts,
        lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    throw new AppError("UNAUTHENTICATED", INVALID);
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await createSession(user.id);
  return { mustChangePassword: user.mustChangePassword };
}

export async function logout() {
  await destroySession();
}

const passwordSchema = z.object({
  current: z.string().min(1, "Informe a senha atual."),
  next: z.string().min(10, "Use pelo menos 10 caracteres.").max(200),
  confirm: z.string(),
});

export async function changeOwnPassword(actor: AuthUser, raw: unknown) {
  const data = parseInput(passwordSchema, raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(data.current, user.passwordHash))) {
    throw new AppError("VALIDATION", "Senha atual incorreta.", { current: ["Senha atual incorreta."] });
  }
  if (data.next !== data.confirm) throw new AppError("VALIDATION", "As senhas não conferem.", { confirm: ["As senhas não conferem."] });
  if (data.next === data.current) throw new AppError("VALIDATION", "A nova senha deve ser diferente da atual.", { next: ["A nova senha deve ser diferente da atual."] });
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(data.next), mustChangePassword: false } });
}
