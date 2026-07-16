export type BudgetPeriod = {
  monthStart: Date;
  monthEnd: Date;
  realizedUntil: Date | null;
};

export function getBudgetPeriod(year: number, month: number, asOf: Date): BudgetPeriod {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1) - 1);
  const target = year * 12 + month - 1;
  const reference = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  return {
    monthStart,
    monthEnd,
    realizedUntil: target < reference ? monthEnd : target === reference ? asOf : null,
  };
}
