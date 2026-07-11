import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditCardInvoicesController } from './credit-card-invoices.controller';
import { CreditCardInvoicesService } from './credit-card-invoices.service';
@Module({ imports: [PrismaModule], controllers: [CreditCardInvoicesController], providers: [CreditCardInvoicesService] })
export class CreditCardInvoicesModule {}
