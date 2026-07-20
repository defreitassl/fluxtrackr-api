import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAccountBalanceAdjustmentDto } from './dto/create-account-balance-adjustment.dto';

async function parse(payload: object) {
  const dto = plainToInstance(CreateAccountBalanceAdjustmentDto, payload);
  return { dto, errors: await validate(dto) };
}

describe('CreateAccountBalanceAdjustmentDto', () => {
  it('trims a meaningful reason before persistence', async () => {
    const { dto, errors } = await parse({ newBalance: '1500.00', reason: ' Conferência manual ' });
    assert.equal(errors.length, 0);
    assert.equal(dto.reason, 'Conferência manual');
  });

  it('normalizes a whitespace-only reason to undefined', async () => {
    const { dto, errors } = await parse({ newBalance: '0', reason: '   ' });
    assert.equal(errors.length, 0);
    assert.equal(dto.reason, undefined);
  });

  it('keeps an absent reason undefined and accepts negative balances', async () => {
    const { dto, errors } = await parse({ newBalance: '-250.75' });
    assert.equal(errors.length, 0);
    assert.equal(dto.reason, undefined);
    assert.equal(dto.newBalance, '-250.75');
  });
});
