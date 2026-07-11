export type InvoiceCycle = { closingDate: Date; dueDate: Date };

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, Math.min(day, daysInUtcMonth(year, month))));
}

function addUtcMonths(year: number, month: number, count: number) {
  const date = new Date(Date.UTC(year, month + count, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function splitAmountInCents(totalAmount: number, count: number) {
  const totalCents = Math.round(totalAmount * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) =>
    base + (index < remainder ? 1 : 0),
  );
}

export function getInvoiceCycles(
  purchaseDate: Date,
  closingDay: number,
  dueDay: number,
  count: number,
): InvoiceCycle[] {
  const purchaseYear = purchaseDate.getUTCFullYear();
  const purchaseMonth = purchaseDate.getUTCMonth();
  const closingThisMonth = utcDate(purchaseYear, purchaseMonth, closingDay);
  const purchaseDay = purchaseDate.getUTCDate();
  const effectiveClosingDay = closingThisMonth.getUTCDate();
  const firstClosingMonthOffset = purchaseDay <= effectiveClosingDay ? 0 : 1;

  return Array.from({ length: count }, (_, index) => {
    const closingMonth = addUtcMonths(
      purchaseYear,
      purchaseMonth,
      firstClosingMonthOffset + index,
    );
    const closingDate = utcDate(closingMonth.year, closingMonth.month, closingDay);
    let dueMonth = closingMonth;
    let dueDate = utcDate(dueMonth.year, dueMonth.month, dueDay);
    if (dueDate <= closingDate) {
      dueMonth = addUtcMonths(dueMonth.year, dueMonth.month, 1);
      dueDate = utcDate(dueMonth.year, dueMonth.month, dueDay);
    }
    return { closingDate, dueDate };
  });
}
