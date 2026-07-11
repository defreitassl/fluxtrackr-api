-- AlterTable
ALTER TABLE "CreditCard" RENAME COLUMN "bank" TO "bankName";
ALTER TABLE "CreditCard" RENAME COLUMN "limit" TO "limitAmount";
ALTER TABLE "CreditCard" RENAME COLUMN "bestPurchaseDay" TO "closingDay";
ALTER TABLE "CreditCard" ADD COLUMN "accountId" TEXT;
ALTER TABLE "CreditCard" DROP COLUMN "isActive";

-- CreateIndex
CREATE INDEX "CreditCard_accountId_idx" ON "CreditCard"("accountId");

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
