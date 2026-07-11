import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreditCardPurchasesService } from './credit-card-purchases.service';
import { CreateCreditCardPurchaseDto } from './dto/create-credit-card-purchase.dto';
import { ListCreditCardPurchasesDto } from './dto/list-credit-card-purchases.dto';

@UseGuards(JwtAuthGuard)
@Controller('credit-card-purchases')
export class CreditCardPurchasesController {
  constructor(private readonly service: CreditCardPurchasesService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCreditCardPurchaseDto) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  findMany(@Req() req: AuthenticatedRequest, @Query() query: ListCreditCardPurchasesDto) {
    return this.service.findMany(req.user.id, query);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(req.user.id, id);
  }
}
