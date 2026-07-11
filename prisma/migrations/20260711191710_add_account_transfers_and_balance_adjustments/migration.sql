-- CreateTable
CREATE TABLE "AccountTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountBalanceAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "previousBalance" DECIMAL(12,2) NOT NULL,
    "newBalance" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountTransfer_userId_occurredAt_idx" ON "AccountTransfer"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountTransfer_sourceAccountId_occurredAt_idx" ON "AccountTransfer"("sourceAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountTransfer_destinationAccountId_occurredAt_idx" ON "AccountTransfer"("destinationAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountBalanceAdjustment_userId_occurredAt_idx" ON "AccountBalanceAdjustment"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountBalanceAdjustment_accountId_occurredAt_idx" ON "AccountBalanceAdjustment"("accountId", "occurredAt");

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBalanceAdjustment" ADD CONSTRAINT "AccountBalanceAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBalanceAdjustment" ADD CONSTRAINT "AccountBalanceAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
