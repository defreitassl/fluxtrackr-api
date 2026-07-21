import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

type TransactionDto = typeof CreateTransactionDto | typeof UpdateTransactionDto;

const createPayload = {
  type: 'expense',
  amount: 1,
  description: 'Mercado',
  source: 'app',
};

async function errorsFor(Dto: TransactionDto, payload: object) {
  return validate(plainToInstance(Dto, payload));
}

describe('Transaction DTO amount validation', () => {
  const cases = [
    { label: 'accepts the maximum Decimal(12,2) amount', value: 9_999_999_999.99, valid: true },
    { label: 'rejects overflow', value: 10_000_000_000, valid: false },
    { label: 'accepts the minimum amount', value: 0.01, valid: true },
    { label: 'rejects zero', value: 0, valid: false },
    { label: 'rejects a negative amount', value: -0.01, valid: false },
    { label: 'rejects more than two decimal places', value: 1.001, valid: false },
    { label: 'rejects Infinity', value: Infinity, valid: false },
    { label: 'rejects NaN', value: Number.NaN, valid: false },
  ];

  for (const Dto of [CreateTransactionDto, UpdateTransactionDto]) {
    for (const testCase of cases) {
      it(`${Dto.name} ${testCase.label}`, async () => {
        const payload = Dto === CreateTransactionDto
          ? { ...createPayload, amount: testCase.value }
          : { amount: testCase.value };
        const errors = await errorsFor(Dto, payload);
        assert.equal(errors.length === 0, testCase.valid);
      });
    }
  }
});

describe('Transaction DTO description normalization', () => {
  for (const Dto of [CreateTransactionDto, UpdateTransactionDto]) {
    it(`${Dto.name} trims a valid description`, async () => {
      const payload = Dto === CreateTransactionDto
        ? { ...createPayload, description: ' Mercado ' }
        : { description: ' Mercado ' };
      const dto = plainToInstance(Dto, payload);
      assert.equal(dto.description, 'Mercado');
      assert.equal((await validate(dto)).length, 0);
    });

    it(`${Dto.name} rejects a whitespace-only description`, async () => {
      const payload = Dto === CreateTransactionDto
        ? { ...createPayload, description: '   ' }
        : { description: '   ' };
      const dto = plainToInstance(Dto, payload);
      assert.equal(dto.description, '');
      assert.ok((await validate(dto)).length > 0);
    });
  }
});
