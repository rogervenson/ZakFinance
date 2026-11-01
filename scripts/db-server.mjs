// Local PostgreSQL server for development.
//
// Uses the `embedded-postgres` package, which downloads the official PostgreSQL
// binaries and runs a real cluster in ./.data/postgres. Data persists between runs.
// To use an external PostgreSQL (installed or Docker) just don't run this script
// and point DATABASE_URL to that server.
import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://zakfinance:zakfinance@localhost:5434/zakfinance");
const port = Number(url.port || 5434);
const user = decodeURIComponent(url.username || "zakfinance");
const password = decodeURIComponent(url.password || "zakfinance");
const database = url.pathname.replace(/^\//, "") || "zakfinance";
const dataDir = path.resolve(process.env.EMBEDDED_PG_DIR ?? ".data/postgres");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  authMethod: "scram-sha-256",
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (err) => console.error("[postgres]", String(err).trim()),
});

// Databases use an ICU collation so accented names sort correctly
// (ex.: "Ágape" antes de "Bruno").
const createDbSql = (name) =>
  `CREATE DATABASE "${name.replace(/"/g, "")}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'pt-BR' LOCALE 'C'`;

async function main() {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`[db] Initializing cluster in ${dataDir} ...`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient("postgres", "localhost");
  await client.connect();
  // Main database plus a separate one for the end-to-end tests.
  for (const name of [database, `${database}_test`]) {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) {
      await client.query(createDbSql(name));
      console.log(`[db] Database "${name}" created.`);
    }
  }
  await client.end();

  console.log(`[db] PostgreSQL ready on localhost:${port} (database "${database}"). Press Ctrl+C to stop.`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\n[db] Stopping PostgreSQL...");
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Keep the process alive.
  setInterval(() => {}, 1 << 30);
}

main().catch(async (err) => {
  console.error("[db] Failed to start PostgreSQL:", err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
