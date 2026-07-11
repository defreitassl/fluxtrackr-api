import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreditCardInvoicesService } from './credit-card-invoices.service';

type Status = 'open' | 'closed' | 'paid' | 'overdue' | 'canceled';

function harness(options: {
  status?: Status;
  paidTransactionId?: string | null;
  owner?: string;
  accountOwner?: string;
  accountActive?: boolean;
  amounts?: Array<{ amount: string; status?: 'pending' | 'paid' | 'canceled' }>;
  failInvoiceUpdate?: boolean;
} = {}) {
  const invoice = {
    id: 'invoice',
    userId: options.owner ?? 'user',
    status: options.status ?? 'open',
    paidTransactionId: options.paidTransactionId ?? null,
    accountId: 'old-account',
    paidAt: null as Date | null,
    paidAmount: null as Prisma.Decimal | null,
    month: 8,
    year: 2026,
    creditCard: { name: 'Nubank' },
    installments: (options.amounts ?? [{ amount: '100.00' }]).map((item, index) => ({
      id: `installment-${index + 1}`,
      userId: 'user',
      invoiceId: 'invoice',
      installmentAmount: new Prisma.Decimal(item.amount),
      status: item.status ?? 'pending',
      dueDate: new Date('2026-08-07T00:00:00.000Z'),
      installmentNumber: index + 1,
    })),
  };
  const transactions: any[] = [];
  let invoiceUpdates = 0;
  let installmentUpdates = 0;

  const tx = {
    creditCardInvoice: {
      findFirst: async ({ where }: any) => where.userId === invoice.userId ? invoice : null,
      update: async ({ data }: any) => {
        if (options.failInvoiceUpdate) throw new Error('invoice update failed');
        invoiceUpdates += 1;
        Object.assign(invoice, data);
        return invoice;
      },
      findUniqueOrThrow: async () => invoice,
    },
    account: {
      findFirst: async ({ where }: any) =>
        where.userId === (options.accountOwner ?? 'user') &&
        where.isActive === true && options.accountActive !== false
          ? { id: where.id }
          : null,
    },
    transaction: {
      create: async ({ data }: any) => {
        const transaction = { id: `transaction-${transactions.length + 1}`, ...data };
        transactions.push(transaction);
        return transaction;
      },
    },
    installment: {
      updateMany: async () => {
        installmentUpdates += 1;
        invoice.installments.forEach((item) => {
          if (item.status === 'pending') item.status = 'paid';
        });
      },
    },
  };
  const prisma = {
    creditCardInvoice: {
      findMany: async () => [invoice],
      findFirst: async ({ where }: any) =>
        where.userId === invoice.userId ? invoice : null,
    },
    $transaction: async (operation: any) => {
      const snapshot = {
        status: invoice.status,
        paidTransactionId: invoice.paidTransactionId,
        accountId: invoice.accountId,
        paidAt: invoice.paidAt,
        paidAmount: invoice.paidAmount,
        installmentStatuses: invoice.installments.map((item) => item.status),
        transactionCount: transactions.length,
      };
      try {
        return await operation(tx);
      } catch (error) {
        invoice.status = snapshot.status;
        invoice.paidTransactionId = snapshot.paidTransactionId;
        invoice.accountId = snapshot.accountId;
        invoice.paidAt = snapshot.paidAt;
        invoice.paidAmount = snapshot.paidAmount;
        invoice.installments.forEach((item, index) => { item.status = snapshot.installmentStatuses[index]; });
        transactions.splice(snapshot.transactionCount);
        throw error;
      }
    },
  };
  return {
    service: new CreditCardInvoicesService(prisma as any),
    invoice,
    transactions,
    counts: () => ({ invoiceUpdates, installmentUpdates }),
  };
}

const payment = { accountId: '00000000-0000-4000-8000-000000000001', paidAt: '2026-08-07T12:00:00.000Z' };

describe('CreditCardInvoicesService pay', () => {
  it('rejects archived payment account without side effects', async () => {
    const context = harness({ accountActive: false });
    await assert.rejects(() => context.service.pay('user', 'invoice', payment), NotFoundException);
    assert.equal(context.transactions.length, 0);
    assert.equal(context.invoice.status, 'open');
    assert.equal(context.counts().invoiceUpdates, 0);
  });
  it('shows invoice total without canceled installments', async () => {
    const context = harness({
      amounts: [
        { amount: '90.00' },
        { amount: '10.00', status: 'canceled' },
      ],
    });
    const invoice = await context.service.findOne('user', 'invoice');
    assert.equal(invoice.totalAmount.toFixed(2), '90.00');
  });

  it('uses the same total in invoice queries and payment', async () => {
    const context = harness({
      amounts: [
        { amount: '100.10' },
        { amount: '200.20' },
        { amount: '50.00', status: 'canceled' },
      ],
    });
    const queriedInvoice = await context.service.findOne('user', 'invoice');
    const paidInvoice = await context.service.pay('user', 'invoice', payment);
    assert.equal(
      queriedInvoice.totalAmount.toFixed(2),
      paidInvoice.totalAmount.toFixed(2),
    );
  });

  it('pays the full total, creates the bank transaction, and updates invoice and installments', async () => {
    const context = harness({ amounts: [{ amount: '100.10' }, { amount: '200.20' }] });
    const result = await context.service.pay('user', 'invoice', payment);
    assert.equal(result.totalAmount.toFixed(2), '300.30');
    assert.equal(result.status, 'paid');
    assert.equal(result.accountId, payment.accountId);
    assert.equal(result.paidAmount?.toFixed(2), '300.30');
    assert.deepEqual(context.counts(), { invoiceUpdates: 1, installmentUpdates: 1 });
    assert.ok(result.installments.every((item) => item.status === 'paid'));
    assert.equal(result.transaction.type, 'expense');
    assert.equal(result.transaction.amount.toFixed(2), '300.30');
    assert.equal(result.transaction.description, 'Pagamento da fatura Nubank - 08/2026');
    assert.equal(result.transaction.accountId, payment.accountId);
    assert.equal(result.transaction.paymentMethod, 'transfer');
    assert.equal(result.transaction.source, 'app');
    assert.equal(result.transaction.categoryId, undefined);
  });

  it('excludes canceled installments from the total and leaves them canceled', async () => {
    const context = harness({ amounts: [{ amount: '90.00' }, { amount: '10.00', status: 'canceled' }] });
    const result = await context.service.pay('user', 'invoice', payment);
    assert.equal(result.totalAmount.toFixed(2), '90.00');
    assert.deepEqual(result.installments.map((item) => item.status), ['paid', 'canceled']);
  });

  it('rejects an account from another user or an absent account', async () => {
    const context = harness({ accountOwner: 'other-user' });
    await assert.rejects(() => context.service.pay('user', 'invoice', payment), NotFoundException);
  });

  it('returns 404 for an invoice from another user', async () => {
    const context = harness({ owner: 'other-user' });
    await assert.rejects(() => context.service.pay('user', 'invoice', payment), NotFoundException);
  });

  it('rejects paid invoices and duplicate payment attempts with 409', async () => {
    const paid = harness({ status: 'paid', paidTransactionId: 'transaction' });
    await assert.rejects(() => paid.service.pay('user', 'invoice', payment), ConflictException);
    const context = harness();
    await context.service.pay('user', 'invoice', payment);
    await assert.rejects(() => context.service.pay('user', 'invoice', payment), ConflictException);
    assert.equal(context.transactions.length, 1);
  });

  it('rejects canceled invoices and totals without positive installments', async () => {
    await assert.rejects(() => harness({ status: 'canceled' }).service.pay('user', 'invoice', payment), BadRequestException);
    await assert.rejects(() => harness({ amounts: [{ amount: '10.00', status: 'canceled' }] }).service.pay('user', 'invoice', payment), BadRequestException);
  });

  it('rolls back the transaction creation when a later update fails', async () => {
    const context = harness({ failInvoiceUpdate: true });
    await assert.rejects(() => context.service.pay('user', 'invoice', payment), /invoice update failed/);
    assert.equal(context.transactions.length, 0);
    assert.equal(context.invoice.status, 'open');
    assert.ok(context.invoice.installments.every((item) => item.status === 'pending'));
  });
});
