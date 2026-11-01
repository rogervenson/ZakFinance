-- AlterTable
ALTER TABLE "investment_operations" ADD COLUMN     "kind" TEXT,
ADD COLUMN     "prevAvgPriceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prevQuantity" INTEGER NOT NULL DEFAULT 0;

