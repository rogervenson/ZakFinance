-- AlterTable
ALTER TABLE "import_runs" ADD COLUMN     "previousOpeningCents" INTEGER;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "recurrenceId" TEXT,
ADD COLUMN     "recurrenceMonth" TEXT;

-- CreateTable
CREATE TABLE "recurrences" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "categoryId" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrence_skips" (
    "id" TEXT NOT NULL,
    "recurrenceId" TEXT NOT NULL,
    "month" TEXT NOT NULL,

    CONSTRAINT "recurrence_skips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dismissed_series" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissed_series_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "recurrence_skips_recurrenceId_month_key" ON "recurrence_skips"("recurrenceId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurrenceId_recurrenceMonth_key" ON "transactions"("recurrenceId", "recurrenceMonth");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_skips" ADD CONSTRAINT "recurrence_skips_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "recurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

