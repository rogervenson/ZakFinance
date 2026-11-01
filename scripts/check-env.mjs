// Roda antes do start de produção: falha cedo, com mensagem clara, se faltar configuração.
import "dotenv/config";

const problems = [];
const url = process.env.DATABASE_URL ?? "";
if (!url) problems.push("DATABASE_URL não definida. No Railway, adicione um PostgreSQL e use ${{Postgres.DATABASE_URL}} no serviço do app.");
else if (!/^postgres(ql)?:\/\//.test(url)) problems.push("DATABASE_URL não parece uma conexão PostgreSQL (deve começar com postgresql://).");

if (problems.length) {
  for (const p of problems) console.error(`[config] ERRO: ${p}`);
  process.exit(1);
}
console.log("[config] Ambiente OK.");
