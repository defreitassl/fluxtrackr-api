import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialTimelineModule } from './financial-timeline.module';
import { FinancialTimelineService } from './financial-timeline.service';

describe('FinancialTimelineModule', () => {
  it('imports PrismaModule and exports FinancialTimelineService', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, FinancialTimelineModule);
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, FinancialTimelineModule);
    assert.ok(imports.includes(PrismaModule));
    assert.ok(exports.includes(FinancialTimelineService));
  });
});
