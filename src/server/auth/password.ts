import bcrypt from "bcryptjs";

const ROUNDS = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, ROUNDS);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

let dummyHash: Promise<string> | null = null;

/**
 * Runs a "fake" check with the same cost as a real one, used when the email
 * doesn't exist, so response times don't reveal which accounts exist.
 */
export async function burnPasswordCheck(password: string) {
  dummyHash ??= bcrypt.hash("dummy-password-to-equalize-timing", ROUNDS);
  await bcrypt.compare(password, await dummyHash);
}
