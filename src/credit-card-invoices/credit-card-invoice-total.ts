import { Prisma } from '@prisma/client';

type InvoiceInstallment = {
  installmentAmount: Prisma.Decimal;
  status: string;
};

export function calculateCreditCardInvoiceTotal(
  installments: InvoiceInstallment[],
) {
  return installments
    .filter((installment) => installment.status !== 'canceled')
    .reduce(
      (total, installment) => total.add(installment.installmentAmount),
      new Prisma.Decimal(0),
    );
}
