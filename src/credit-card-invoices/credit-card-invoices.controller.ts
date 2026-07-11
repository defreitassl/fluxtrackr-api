import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreditCardInvoicesService } from './credit-card-invoices.service';
import { ListCreditCardInvoicesDto } from './dto/list-credit-card-invoices.dto';

@UseGuards(JwtAuthGuard)
@Controller('credit-card-invoices')
export class CreditCardInvoicesController {
  constructor(private readonly service: CreditCardInvoicesService) {}
  @Get() findMany(@Req() req: AuthenticatedRequest, @Query() query: ListCreditCardInvoicesDto) { return this.service.findMany(req.user.id, query); }
  @Get(':id') findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.findOne(req.user.id, id); }
}
