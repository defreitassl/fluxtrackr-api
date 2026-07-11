ALTER TABLE "FixedOccurrence"
ADD CONSTRAINT "FixedOccurrence_origin_type_check"
CHECK (
  ("type" = 'expense' AND "fixedExpenseId" IS NOT NULL AND "fixedIncomeId" IS NULL)
  OR
  ("type" = 'income' AND "fixedIncomeId" IS NOT NULL AND "fixedExpenseId" IS NULL)
);
