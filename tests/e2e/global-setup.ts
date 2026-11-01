import { execSync } from "node:child_process";
import pg from "pg";
import { E2E_ENV } from "./env";

/** Apaga e migra o banco de TESTE, aplica o seed e os dados fictícios. Nunca toca no banco real. */
export default async function globalSetup() {
  if (!E2E_ENV.DATABASE_URL.includes("_test")) throw new Error("E2E deve usar o banco de teste.");
  const client = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  const env = { ...process.env, ...E2E_ENV };
  const run = (cmd: string) => execSync(cmd, { env, stdio: "inherit" });
  run("npx prisma migrate deploy");
  run("npx tsx prisma/seed.ts");
  run("npx tsx tests/e2e/support/seed-test.ts");
}
