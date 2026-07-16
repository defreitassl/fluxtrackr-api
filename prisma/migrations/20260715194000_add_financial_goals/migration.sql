CREATE TYPE "FinancialGoalStatus" AS ENUM ('active', 'completed', 'canceled');
CREATE TYPE "GoalContributionType" AS ENUM ('contribution', 'withdrawal');

CREATE TABLE "FinancialGoal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "targetAmount" DECIMAL(12,2) NOT NULL,
  "targetDate" TIMESTAMP(3),
  "status" "FinancialGoalStatus" NOT NULL DEFAULT 'active',
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialGoal_targetAmount_check" CHECK ("targetAmount" > 0),
  CONSTRAINT "FinancialGoal_status_check" CHECK (
    ("status" = 'active' AND "completedAt" IS NULL AND "canceledAt" IS NULL)
    OR ("status" = 'completed' AND "completedAt" IS NOT NULL AND "canceledAt" IS NULL)
    OR ("status" = 'canceled' AND "completedAt" IS NULL AND "canceledAt" IS NOT NULL)
  )
);

CREATE TABLE "GoalContribution" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "type" "GoalContributionType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoalContribution_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "FinancialGoal_userId_status_idx" ON "FinancialGoal"("userId", "status");
CREATE INDEX "FinancialGoal_userId_targetDate_idx" ON "FinancialGoal"("userId", "targetDate");
CREATE INDEX "GoalContribution_userId_occurredAt_idx" ON "GoalContribution"("userId", "occurredAt");
CREATE INDEX "GoalContribution_goalId_occurredAt_idx" ON "GoalContribution"("goalId", "occurredAt");

ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
