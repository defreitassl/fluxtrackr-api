import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAccountDto } from './dto/create-account.dto';

async function errorsFor(initialBalance: unknown) {
  const dto = plainToInstance(CreateAccountDto, {
    name: 'Conta', type: 'checking', initialBalance,
  });
  return validate(dto);
}

describe('CreateAccountDto', () => {
  it('accepts the Decimal(12,2) numeric bounds', async () => {
    assert.equal((await errorsFor(9_999_999_999.99)).length, 0);
    assert.equal((await errorsFor(-9_999_999_999.99)).length, 0);
  });

  it('rejects overflow, non-finite values and more than two decimal places', async () => {
    for (const value of [10_000_000_000, -10_000_000_000, Infinity, Number.NaN, 1.001]) {
      assert.ok((await errorsFor(value)).length > 0, String(value));
    }
  });
});
