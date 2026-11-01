import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` (run on install/build) doesn't connect to the database, so it must
// work without DATABASE_URL. Commands that do connect (migrate, db seed) fail with a
// clear connection error if the variable is missing or wrong.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
