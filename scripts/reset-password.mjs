// Define uma nova senha para um usuário. Uso: npm run reset-password -- email@exemplo.com
// A senha é pedida no terminal (não fica no histórico). Sessões abertas são encerradas.
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import pg from "pg";

const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? "zak@exemplo.com").trim().toLowerCase();
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = (await rl.question(`Nova senha para ${email} (mínimo 8 caracteres): `)).trim();
rl.close();
if (password.length < 8) {
  console.error("Senha curta demais. Nada foi alterado.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await client.query('update users set "passwordHash" = $1, "mustChangePassword" = false, "failedLoginCount" = 0, "lockedUntil" = null where lower(email) = $2 returning id', [hash, email]);
  if (rows.length === 0) {
    console.error(`Nenhum usuário com o e-mail ${email}. Nada foi alterado.`);
    process.exitCode = 1;
  } else {
    await client.query('delete from sessions where "userId" = $1', [rows[0].id]);
    console.log("Senha alterada. Entre com o e-mail e a nova senha.");
  }
} finally {
  await client.end();
}
