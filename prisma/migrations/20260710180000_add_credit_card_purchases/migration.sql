CREATE TABLE "CreditCardPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreditCardPurchase_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Installment" ADD COLUMN "purchaseId" TEXT;

CREATE INDEX "CreditCardPurchase_userId_purchaseDate_idx" ON "CreditCardPurchase"("userId", "purchaseDate");
CREATE INDEX "CreditCardPurchase_creditCardId_idx" ON "CreditCardPurchase"("creditCardId");
CREATE INDEX "CreditCardPurchase_categoryId_idx" ON "CreditCardPurchase"("categoryId");
CREATE INDEX "Installment_purchaseId_idx" ON "Installment"("purchaseId");

ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CreditCardPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
