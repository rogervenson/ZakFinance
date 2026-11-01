import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_PORT } from "./tests/e2e/env";

// End-to-end tests run against an isolated server (port 3200) using the TEST
// database, prepared by global-setup. Requires PostgreSQL running
// (`npm run db`). The app is built and started in production mode.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx next start -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...E2E_ENV },
  },
});
