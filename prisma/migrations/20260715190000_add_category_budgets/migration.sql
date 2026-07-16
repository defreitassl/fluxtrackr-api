CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "limitAmount" DECIMAL(12,2) NOT NULL,
    "warningPercentage" INTEGER NOT NULL DEFAULT 80,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CategoryBudget_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "CategoryBudget_limitAmount_check" CHECK ("limitAmount" > 0),
    CONSTRAINT "CategoryBudget_warningPercentage_check" CHECK ("warningPercentage" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "CategoryBudget_userId_categoryId_year_month_key" ON "CategoryBudget"("userId", "categoryId", "year", "month");
CREATE INDEX "CategoryBudget_userId_year_month_idx" ON "CategoryBudget"("userId", "year", "month");
CREATE INDEX "CategoryBudget_categoryId_year_month_idx" ON "CategoryBudget"("categoryId", "year", "month");

ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
