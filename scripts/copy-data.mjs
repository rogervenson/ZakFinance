// Copia todos os dados do banco local para outro banco (ex.: o PostgreSQL do Railway).
//
// Uso:
//   npm run copy-data -- "postgresql://...DATABASE_PUBLIC_URL do Railway..."
//
// O destino precisa já ter as tabelas (o primeiro deploy cria). Os dados que estiverem
// lá são APAGADOS e substituídos pelos daqui — por isso o script pede confirmação.
// Sessões não são copiadas (você entra de novo com a mesma senha de hoje).
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import pg from "pg";

const SKIP = new Set(["_prisma_migrations", "sessions"]);
const CHUNK = 500;

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.argv[2];
if (!targetUrl || !/^postgres(ql)?:\/\//.test(targetUrl)) {
  console.error('Informe a URL do banco de destino: npm run copy-data -- "postgresql://..."');
  process.exit(1);
}
if (targetUrl === sourceUrl) {
  console.error("Origem e destino são o mesmo banco. Nada foi feito.");
  process.exit(1);
}

const host = (u) => new URL(u).host + new URL(u).pathname;
const source = new pg.Client({ connectionString: sourceUrl });
const isLocal = /localhost|127\.0\.0\.1/.test(targetUrl);
const target = new pg.Client({ connectionString: targetUrl, ssl: isLocal ? undefined : { rejectUnauthorized: false } });
await source.connect();
await target.connect();

const listTables = async (c) =>
  (await c.query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name")).rows
    .map((r) => r.table_name)
    .filter((t) => !SKIP.has(t));

try {
  const tables = await listTables(source);
  const targetTables = new Set(await listTables(target));
  const missing = tables.filter((t) => !targetTables.has(t));
  if (missing.length) {
    console.error(`O destino ainda não tem as tabelas: ${missing.join(", ")}.\nFaça o primeiro deploy no Railway (ele cria as tabelas) e rode de novo.`);
    process.exitCode = 1;
  } else {
    const counts = {};
    for (const t of tables) counts[t] = Number((await source.query(`select count(*) from "${t}"`)).rows[0].count);
    console.log(`Origem:  ${host(sourceUrl)}\nDestino: ${host(targetUrl)}\n`);
    for (const t of tables) console.log(`  ${t.padEnd(24)} ${counts[t]}`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('\nOs dados do DESTINO serão apagados e substituídos por estes. Digite "copiar" para continuar: ')).trim();
    rl.close();
    if (answer !== "copiar") {
      console.log("Cancelado. Nada foi alterado.");
    } else {
      await target.query("begin");
      try {
        // Sem checar chaves estrangeiras durante a carga; a ordem das tabelas deixa de importar.
        await target.query("set local session_replication_role = replica");
        await target.query(`truncate ${[...tables, "sessions"].map((t) => `"${t}"`).join(", ")} cascade`);
        for (const t of tables) {
          for (let offset = 0; offset < counts[t]; offset += CHUNK) {
            const { rows } = await source.query(`select coalesce(json_agg(x), '[]') as data from (select * from "${t}" order by 1 limit ${CHUNK} offset ${offset}) x`);
            await target.query(`insert into "${t}" select * from json_populate_recordset(null::"${t}", $1::json)`, [JSON.stringify(rows[0].data)]);
          }
        }
        for (const t of tables) {
          const n = Number((await target.query(`select count(*) from "${t}"`)).rows[0].count);
          if (n !== counts[t]) throw new Error(`Contagem diferente em ${t}: origem ${counts[t]}, destino ${n}.`);
        }
        await target.query("commit");
        console.log("\nDados copiados e conferidos. Entre no app publicado com o mesmo e-mail e senha de hoje.");
      } catch (e) {
        await target.query("rollback");
        throw e;
      }
    }
  }
} finally {
  await source.end();
  await target.end();
}
