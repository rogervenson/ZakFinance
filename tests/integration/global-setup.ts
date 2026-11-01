import { execSync } from "node:child_process";
import pg from "pg";
import "dotenv/config";

/** Apaga e migra o banco de TESTE e aplica o seed base. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://zakfinance:zakfinance@localhost:5434/zakfinance_test";
  if (!url.includes("_test")) throw new Error("Integração deve usar o banco de teste.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  const env = { ...process.env, DATABASE_URL: url, ADMIN_PASSWORD: "Teste@123456" };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });
}
