CREATE TYPE "NotificationCategory" AS ENUM ('invoices', 'events', 'subscriptions', 'budgets', 'goals');
CREATE TYPE "NotificationType" AS ENUM ('invoice_due_soon', 'invoice_overdue', 'financial_event_upcoming', 'subscription_charge_upcoming', 'subscription_charge_overdue', 'budget_near_limit', 'budget_exceeded', 'goal_deadline_upcoming', 'goal_overdue');
CREATE TYPE "NotificationSeverity" AS ENUM ('info', 'warning', 'critical');
CREATE TYPE "NotificationSourceType" AS ENUM ('credit_card_invoice', 'financial_event', 'subscription_charge', 'category_budget', 'financial_goal');
CREATE TYPE "ActivityType" AS ENUM ('transaction_created', 'transaction_updated', 'transaction_deleted', 'transfer_created', 'balance_adjustment_created', 'invoice_paid', 'financial_event_confirmed', 'financial_event_realized', 'financial_event_postponed', 'financial_event_canceled', 'subscription_created', 'subscription_updated', 'subscription_archived', 'subscription_charge_realized', 'subscription_charge_canceled', 'category_archived', 'category_reactivated', 'category_budget_created', 'category_budget_updated', 'category_budget_archived', 'financial_goal_created', 'financial_goal_updated', 'financial_goal_completed', 'financial_goal_reopened', 'financial_goal_canceled', 'goal_contribution_added', 'goal_withdrawal_added');
CREATE TYPE "ActivityEntityType" AS ENUM ('transaction', 'account_transfer', 'account_balance_adjustment', 'credit_card_invoice', 'financial_event', 'subscription', 'subscription_charge', 'category', 'category_budget', 'financial_goal', 'goal_contribution');

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "category" "NotificationCategory" NOT NULL,
  "type" "NotificationType" NOT NULL, "severity" "NotificationSeverity" NOT NULL,
  "title" TEXT NOT NULL, "message" TEXT NOT NULL, "sourceType" "NotificationSourceType" NOT NULL,
  "sourceId" TEXT NOT NULL, "dedupeKey" TEXT NOT NULL, "scheduledFor" TIMESTAMP(3),
  "readAt" TIMESTAMP(3), "dismissedAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "category" "NotificationCategory" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "leadDays" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_leadDays_check" CHECK ("leadDays" IS NULL OR "leadDays" BETWEEN 0 AND 90)
);
CREATE TABLE "Activity" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" "ActivityType" NOT NULL,
  "entityType" "ActivityEntityType" NOT NULL, "entityId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT, "metadata" JSONB, "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_userId_resolvedAt_idx" ON "Notification"("userId", "resolvedAt");
CREATE INDEX "Notification_sourceType_sourceId_idx" ON "Notification"("sourceType", "sourceId");
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");
CREATE INDEX "Activity_userId_occurredAt_idx" ON "Activity"("userId", "occurredAt");
CREATE INDEX "Activity_userId_type_occurredAt_idx" ON "Activity"("userId", "type", "occurredAt");
CREATE INDEX "Activity_entityType_entityId_idx" ON "Activity"("entityType", "entityId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
