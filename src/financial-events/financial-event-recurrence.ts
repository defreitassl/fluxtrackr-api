export type SupportedRecurrence = 'once' | 'monthly' | 'semiannual' | 'yearly';

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function getNextFinancialEventDate(
  date: Date,
  recurrence: SupportedRecurrence,
) {
  if (recurrence === 'once') return null;
  const months = recurrence === 'monthly' ? 1 : recurrence === 'semiannual' ? 6 : 12;
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(
        date.getUTCDate(),
        daysInUtcMonth(target.getUTCFullYear(), target.getUTCMonth()),
      ),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
