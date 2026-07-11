import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditCardPurchasesController } from './credit-card-purchases.controller';
import { CreditCardPurchasesService } from './credit-card-purchases.service';

@Module({ imports: [PrismaModule], controllers: [CreditCardPurchasesController], providers: [CreditCardPurchasesService] })
export class CreditCardPurchasesModule {}
