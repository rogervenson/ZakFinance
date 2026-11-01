import "dotenv/config";

/** Ambiente isolado dos testes e2e (banco e porta próprios). */
export const E2E_PORT = 3200;
export const E2E_ENV = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://zakfinance:zakfinance@localhost:5434/zakfinance_test",
  ADMIN_EMAIL: "zak@test.local",
  ADMIN_PASSWORD: "Teste@123456",
  ADMIN_NAME: "Zak Teste",
  APP_TIMEZONE: "America/Sao_Paulo",
};
