-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('BUY', 'SELL');

-- AlterTable
ALTER TABLE "holdings" ADD COLUMN     "realizedCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "ticker" TEXT;

-- CreateTable
CREATE TABLE "investment_operations" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "type" "OperationType" NOT NULL,
    "date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "feesCents" INTEGER NOT NULL DEFAULT 0,
    "realizedCents" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "ticker" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "changePct" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("ticker")
);

-- CreateIndex
CREATE INDEX "investment_operations_ticker_date_idx" ON "investment_operations"("ticker", "date");

-- CreateIndex
CREATE INDEX "transactions_ticker_idx" ON "transactions"("ticker");

