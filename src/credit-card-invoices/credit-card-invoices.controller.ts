import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreditCardInvoicesService } from './credit-card-invoices.service';
import { ListCreditCardInvoicesDto } from './dto/list-credit-card-invoices.dto';
import { PayCreditCardInvoiceDto } from './dto/pay-credit-card-invoice.dto';

@UseGuards(JwtAuthGuard)
@Controller('credit-card-invoices')
export class CreditCardInvoicesController {
  constructor(private readonly service: CreditCardInvoicesService) {}

  @Get()
  findMany(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListCreditCardInvoicesDto,
  ) {
    return this.service.findMany(req.user.id, query);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findOne(req.user.id, id);
  }

  @Post(':id/pay') pay(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PayCreditCardInvoiceDto,
  ) {
    return this.service.pay(req.user.id, id, dto);
  }
}
