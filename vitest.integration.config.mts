import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://zakfinance:zakfinance@localhost:5434/zakfinance_test";

// Testes de integração: serviços contra o banco de TESTE (apagado no globalSetup).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    env: { APP_TIMEZONE: "America/Sao_Paulo", DATABASE_URL: TEST_DB },
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
