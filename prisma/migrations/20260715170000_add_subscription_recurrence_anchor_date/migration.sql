-- Preserve each existing schedule's current base before making the anchor mandatory.
ALTER TABLE "Subscription" ADD COLUMN "recurrenceAnchorDate" TIMESTAMP(3);

UPDATE "Subscription"
SET "recurrenceAnchorDate" = "nextChargeDate"
WHERE "recurrenceAnchorDate" IS NULL;

ALTER TABLE "Subscription" ALTER COLUMN "recurrenceAnchorDate" SET NOT NULL;

CREATE INDEX "Subscription_userId_recurrenceAnchorDate_idx"
ON "Subscription"("userId", "recurrenceAnchorDate");
