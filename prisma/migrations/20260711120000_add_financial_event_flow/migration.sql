ALTER TYPE "FinancialEventStatus" ADD VALUE IF NOT EXISTS 'realized';

ALTER TABLE "FinancialEvent"
ADD COLUMN "paymentMethod" "PaymentMethod",
ADD COLUMN "installmentCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "confirmedCreditCardPurchaseId" TEXT;

CREATE UNIQUE INDEX "FinancialEvent_confirmedCreditCardPurchaseId_key"
ON "FinancialEvent"("confirmedCreditCardPurchaseId");

ALTER TABLE "FinancialEvent"
ADD CONSTRAINT "FinancialEvent_confirmedCreditCardPurchaseId_fkey"
FOREIGN KEY ("confirmedCreditCardPurchaseId") REFERENCES "CreditCardPurchase"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
