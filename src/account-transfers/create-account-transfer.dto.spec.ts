import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { CreateAccountTransferDto } from './dto/create-account-transfer.dto';

async function parse(payload: object) {
  const dto = plainToInstance(CreateAccountTransferDto, payload);
  return { dto, errors: await validate(dto) };
}

const ids = {
  sourceAccountId: '00000000-0000-4000-8000-000000000001',
  destinationAccountId: '00000000-0000-4000-8000-000000000002',
};

describe('CreateAccountTransferDto', () => {
  it('accepts Decimal(12,2) bounds and normalizes the optional description', async () => {
    const maximum = await parse({ ...ids, amount: '9999999999.99', description: ' Transferência mensal ' });
    const minimum = await parse({ ...ids, amount: '-9999999999.99' });
    assert.equal(maximum.errors.length, 0);
    assert.equal(maximum.dto.description, 'Transferência mensal');
    assert.equal(minimum.errors.length, 0);
  });

  it('rejects decimal overflow, too many decimal places and scientific notation', async () => {
    for (const amount of ['10000000000', '-10000000000', '1.001', '1e3']) {
      const { errors } = await parse({ ...ids, amount });
      assert.ok(errors.length > 0, amount);
    }
  });

  it('omits a whitespace-only description', async () => {
    const { dto, errors } = await parse({ ...ids, amount: '250.00', description: '   ' });
    assert.equal(errors.length, 0);
    assert.equal(dto.description, undefined);
  });

  it('returns 400 from the request validation pipe for decimal overflow before Prisma', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await assert.rejects(
      () => pipe.transform({ ...ids, amount: '10000000000.00' }, { type: 'body', metatype: CreateAccountTransferDto }),
      (error: unknown) => error instanceof BadRequestException && error.getStatus() === 400,
    );
  });
});
