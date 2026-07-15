-- Persisted snapshots of the financial charges generated from subscription templates.
CREATE TYPE "SubscriptionChargeStatus" AS ENUM ('pending', 'realized', 'canceled');

ALTER TABLE "Subscription" ADD COLUMN "paymentMethod" "PaymentMethod";

CREATE TABLE "SubscriptionCharge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" "SubscriptionChargeStatus" NOT NULL DEFAULT 'pending',
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "chargeDate" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "categoryId" TEXT,
    "accountId" TEXT,
    "creditCardId" TEXT,
    "paymentMethod" "PaymentMethod",
    "realizedTransactionId" TEXT,
    "realizedCreditCardPurchaseId" TEXT,
    "realizedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionCharge_realizedTransactionId_key" ON "SubscriptionCharge"("realizedTransactionId");
CREATE UNIQUE INDEX "SubscriptionCharge_realizedCreditCardPurchaseId_key" ON "SubscriptionCharge"("realizedCreditCardPurchaseId");
CREATE UNIQUE INDEX "SubscriptionCharge_subscriptionId_chargeDate_key" ON "SubscriptionCharge"("subscriptionId", "chargeDate");
CREATE INDEX "SubscriptionCharge_userId_chargeDate_idx" ON "SubscriptionCharge"("userId", "chargeDate");
CREATE INDEX "SubscriptionCharge_userId_status_chargeDate_idx" ON "SubscriptionCharge"("userId", "status", "chargeDate");
CREATE INDEX "SubscriptionCharge_subscriptionId_idx" ON "SubscriptionCharge"("subscriptionId");
CREATE INDEX "SubscriptionCharge_accountId_idx" ON "SubscriptionCharge"("accountId");
CREATE INDEX "SubscriptionCharge_creditCardId_idx" ON "SubscriptionCharge"("creditCardId");

ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_realizedTransactionId_fkey" FOREIGN KEY ("realizedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_realizedCreditCardPurchaseId_fkey" FOREIGN KEY ("realizedCreditCardPurchaseId") REFERENCES "CreditCardPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_destination_check" CHECK (("accountId" IS NOT NULL AND "creditCardId" IS NULL) OR ("accountId" IS NULL AND "creditCardId" IS NOT NULL));
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_account_payment_check" CHECK ("accountId" IS NULL OR "paymentMethod" IS DISTINCT FROM 'credit'::"PaymentMethod");
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_realized_result_check" CHECK ("realizedTransactionId" IS NULL OR "realizedCreditCardPurchaseId" IS NULL);
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_status_check" CHECK (
  ("status" = 'pending' AND "realizedTransactionId" IS NULL AND "realizedCreditCardPurchaseId" IS NULL AND "realizedAt" IS NULL AND "canceledAt" IS NULL)
  OR ("status" = 'realized' AND (("realizedTransactionId" IS NOT NULL AND "realizedCreditCardPurchaseId" IS NULL) OR ("realizedTransactionId" IS NULL AND "realizedCreditCardPurchaseId" IS NOT NULL)) AND "realizedAt" IS NOT NULL AND "canceledAt" IS NULL)
  OR ("status" = 'canceled' AND "realizedTransactionId" IS NULL AND "realizedCreditCardPurchaseId" IS NULL AND "realizedAt" IS NULL AND "canceledAt" IS NOT NULL)
);
