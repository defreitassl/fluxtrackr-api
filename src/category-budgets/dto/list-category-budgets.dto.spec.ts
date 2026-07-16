import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { ListCategoryBudgetsDto } from './list-category-budgets.dto';

describe('ListCategoryBudgetsDto', () => {
  it('parses false query parameter without implicit boolean coercion', () => {
    assert.equal(plainToInstance(ListCategoryBudgetsDto, { isActive: 'false' }, { enableImplicitConversion: true }).isActive, false);
    assert.equal(plainToInstance(ListCategoryBudgetsDto, { isActive: 'true' }, { enableImplicitConversion: true }).isActive, true);
  });
});
