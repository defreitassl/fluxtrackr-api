-- CreateEnum
CREATE TYPE "FixedOccurrenceType" AS ENUM ('expense', 'income');

-- CreateEnum
CREATE TYPE "FixedOccurrenceStatus" AS ENUM ('pending', 'realized', 'canceled');

-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- AlterTable
ALTER TABLE "FixedIncome" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- CreateTable
CREATE TABLE "FixedOccurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FixedOccurrenceType" NOT NULL,
    "status" "FixedOccurrenceStatus" NOT NULL DEFAULT 'pending',
    "fixedExpenseId" TEXT,
    "fixedIncomeId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "categoryId" TEXT,
    "accountId" TEXT,
    "paymentMethod" "PaymentMethod",
    "realizedTransactionId" TEXT,
    "realizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedOccurrence_realizedTransactionId_key" ON "FixedOccurrence"("realizedTransactionId");

-- CreateIndex
CREATE INDEX "FixedOccurrence_userId_occurrenceDate_idx" ON "FixedOccurrence"("userId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "FixedOccurrence_userId_status_occurrenceDate_idx" ON "FixedOccurrence"("userId", "status", "occurrenceDate");

-- CreateIndex
CREATE INDEX "FixedOccurrence_fixedExpenseId_idx" ON "FixedOccurrence"("fixedExpenseId");

-- CreateIndex
CREATE INDEX "FixedOccurrence_fixedIncomeId_idx" ON "FixedOccurrence"("fixedIncomeId");

-- CreateIndex
CREATE INDEX "FixedOccurrence_categoryId_idx" ON "FixedOccurrence"("categoryId");

-- CreateIndex
CREATE INDEX "FixedOccurrence_accountId_idx" ON "FixedOccurrence"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedOccurrence_fixedExpenseId_year_month_key" ON "FixedOccurrence"("fixedExpenseId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FixedOccurrence_fixedIncomeId_year_month_key" ON "FixedOccurrence"("fixedIncomeId", "year", "month");

-- CreateIndex
CREATE INDEX "FixedExpense_categoryId_idx" ON "FixedExpense"("categoryId");

-- CreateIndex
CREATE INDEX "FixedExpense_accountId_idx" ON "FixedExpense"("accountId");

-- CreateIndex
CREATE INDEX "FixedIncome_categoryId_idx" ON "FixedIncome"("categoryId");

-- CreateIndex
CREATE INDEX "FixedIncome_accountId_idx" ON "FixedIncome"("accountId");

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedIncome" ADD CONSTRAINT "FixedIncome_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedIncome" ADD CONSTRAINT "FixedIncome_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedOccurrence" ADD CONSTRAINT "FixedOccurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedOccurrence" ADD CONSTRAINT "FixedOccurrence_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedOccurrence" ADD CONSTRAINT "FixedOccurrence_fixedIncomeId_fkey" FOREIGN KEY ("fixedIncomeId") REFERENCES "FixedIncome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedOccurrence" ADD CONSTRAINT "FixedOccurrence_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedOccurrence" ADD CONSTRAINT "FixedOccurrence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedOccurrence" ADD CONSTRAINT "FixedOccurrence_realizedTransactionId_fkey" FOREIGN KEY ("realizedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
