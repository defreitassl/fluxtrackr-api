import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { CreditCardPurchaseDomainService } from '../src/credit-card-purchases/credit-card-purchase-domain.service';
import {
  readDashboardFixtureEnvironment,
  type DashboardFixtureEnvironment,
} from '../src/dev-fixtures/dashboard-dev-fixture-environment';

config();

const fixtureEnvironment = readDashboardFixtureEnvironment();
const databaseUrl = requiredEnvironmentVariable('DATABASE_URL');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const creditCardPurchases = new CreditCardPurchaseDomainService();

async function main() {
  const passwordHash = await bcrypt.hash(fixtureEnvironment.password, 10);
  const preparedAt = new Date();
  const fixtureUsers = await prisma.$transaction(
    async (tx) => {
      await tx.user.deleteMany({
        where: {
          email: {
            in: [fixtureEnvironment.populatedEmail, fixtureEnvironment.emptyEmail],
          },
        },
      });

      const populated = await createPopulatedFixture(
        tx,
        fixtureEnvironment,
        passwordHash,
        preparedAt,
      );
      const empty = await tx.user.create({
        data: {
          name: `${fixtureEnvironment.userNamePrefix} Vazio`,
          email: fixtureEnvironment.emptyEmail,
          passwordHash,
        },
      });

      return { populated, empty };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  console.info(`Fixture preparado: ${fixtureUsers.populated.email} (dados completos)`);
  console.info(`Fixture preparado: ${fixtureUsers.empty.email} (estado vazio)`);
}

async function createPopulatedFixture(
  tx: Prisma.TransactionClient,
  environment: DashboardFixtureEnvironment,
  passwordHash: string,
  now: Date,
) {
  const user = await tx.user.create({
    data: {
      name: `${environment.userNamePrefix} Completo`,
      email: environment.populatedEmail,
      passwordHash,
    },
  });
  const [incomeCategory, housingCategory, foodCategory, transportCategory] = await Promise.all([
    tx.category.create({ data: { userId: user.id, name: 'Renda', type: 'income' } }),
    tx.category.create({ data: { userId: user.id, name: 'Moradia', type: 'expense' } }),
    tx.category.create({ data: { userId: user.id, name: 'Alimentação', type: 'expense' } }),
    tx.category.create({ data: { userId: user.id, name: 'Transporte', type: 'expense' } }),
  ]);
  const [mainAccount, reserveAccount] = await Promise.all([
    tx.account.create({
      data: {
        userId: user.id,
        name: 'Conta principal',
        bank: 'Banco Local',
        type: 'checking',
        color: '#197147',
        icon: 'landmark',
        initialBalance: '2400.00',
      },
    }),
    tx.account.create({
      data: {
        userId: user.id,
        name: 'Reserva',
        bank: 'Banco Local',
        type: 'savings',
        color: '#456D98',
        icon: 'piggy-bank',
        initialBalance: '900.00',
      },
    }),
  ]);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const earlierThisMonth = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    Math.max(1, Math.min(now.getUTCDate() - 2, 5)),
  ));

  await Promise.all([
    tx.transaction.create({
      data: {
        userId: user.id,
        type: 'income',
        amount: '6500.00',
        description: 'Receita de trabalho',
        categoryId: incomeCategory.id,
        accountId: mainAccount.id,
        paymentMethod: 'pix',
        occurredAt: monthStart,
        source: 'app',
      },
    }),
    tx.transaction.create({
      data: {
        userId: user.id,
        type: 'expense',
        amount: '1350.00',
        description: 'Aluguel',
        categoryId: housingCategory.id,
        accountId: mainAccount.id,
        paymentMethod: 'pix',
        occurredAt: earlierThisMonth,
        source: 'app',
      },
    }),
    tx.transaction.create({
      data: {
        userId: user.id,
        type: 'expense',
        amount: '260.00',
        description: 'Mercado da semana',
        categoryId: foodCategory.id,
        accountId: mainAccount.id,
        paymentMethod: 'debit',
        occurredAt: earlierThisMonth,
        source: 'app',
      },
    }),
    tx.transaction.create({
      data: {
        userId: user.id,
        type: 'expense',
        amount: '52.00',
        description: 'Almoço de hoje',
        categoryId: foodCategory.id,
        accountId: mainAccount.id,
        paymentMethod: 'debit',
        occurredAt: today,
        source: 'app',
      },
    }),
    tx.transaction.create({
      data: {
        userId: user.id,
        type: 'expense',
        amount: '78.00',
        description: 'Transporte mensal',
        categoryId: transportCategory.id,
        accountId: mainAccount.id,
        paymentMethod: 'debit',
        occurredAt: today,
        source: 'app',
      },
    }),
  ]);

  await tx.accountTransfer.create({
    data: {
      userId: user.id,
      sourceAccountId: mainAccount.id,
      destinationAccountId: reserveAccount.id,
      amount: '420.00',
      description: 'Reserva mensal',
      occurredAt: now,
    },
  });
  await tx.accountBalanceAdjustment.create({
    data: {
      userId: user.id,
      accountId: reserveAccount.id,
      previousBalance: '1320.00',
      newBalance: '1350.00',
      difference: '30.00',
      reason: 'Conferência de saldo',
      occurredAt: now,
    },
  });
  await tx.categoryBudget.create({
    data: {
      userId: user.id,
      categoryId: foodCategory.id,
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      limitAmount: '500.00',
      warningPercentage: 80,
    },
  });

  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const closingDay = Math.max(1, Math.min(now.getUTCDate(), lastDay - 1));
  const cardPurchaseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), closingDay));
  const creditCard = await tx.creditCard.create({
    data: {
      userId: user.id,
      accountId: mainAccount.id,
      name: 'Cartão Flux',
      bankName: 'Banco Local',
      brand: 'Visa',
      lastFourDigits: '4242',
      limitAmount: '5000.00',
      closingDay,
      dueDay: lastDay,
      color: '#197147',
    },
  });
  await creditCardPurchases.create(tx, user.id, {
    creditCardId: creditCard.id,
    categoryId: foodCategory.id,
    description: 'Compras do cartão',
    totalAmount: 480,
    purchaseDate: cardPurchaseDate,
    installmentCount: 2,
  });

  const commitmentDate = addUtcDays(now, 7);
  await tx.financialEvent.create({
    data: {
      userId: user.id,
      type: 'expense',
      name: 'Seguro do carro',
      expectedAmount: '220.00',
      date: commitmentDate,
      categoryId: transportCategory.id,
      accountId: mainAccount.id,
      paymentMethod: 'pix',
      recurrence: 'yearly',
      status: 'confirmed',
    },
  });
  const fixedExpense = await tx.fixedExpense.create({
    data: {
      userId: user.id,
      name: 'Internet residencial',
      amount: '119.90',
      dueDay: commitmentDate.getUTCDate(),
      categoryId: housingCategory.id,
      accountId: mainAccount.id,
      paymentMethod: 'pix',
    },
  });
  await tx.fixedOccurrence.create({
    data: {
      userId: user.id,
      type: 'expense',
      status: 'pending',
      fixedExpenseId: fixedExpense.id,
      name: fixedExpense.name,
      amount: fixedExpense.amount,
      occurrenceDate: commitmentDate,
      year: commitmentDate.getUTCFullYear(),
      month: commitmentDate.getUTCMonth() + 1,
      categoryId: fixedExpense.categoryId,
      accountId: fixedExpense.accountId,
      paymentMethod: fixedExpense.paymentMethod,
    },
  });

  return user;
}

function addUtcDays(date: Date, amount: number) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + amount,
  ));
}

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
