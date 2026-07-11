import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { AccountBalanceAdjustmentsService } from './account-balance-adjustments.service';
import { CreateAccountBalanceAdjustmentDto } from './dto/create-account-balance-adjustment.dto';
import { GetAccountBalanceDto } from './dto/get-account-balance.dto';

@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId')
export class AccountBalanceAdjustmentsController {
  constructor(private readonly service: AccountBalanceAdjustmentsService) {}

  @Post('balance-adjustments')
  create(
    @Req() req: AuthenticatedRequest,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: CreateAccountBalanceAdjustmentDto,
  ) {
    return this.service.create(req.user.id, accountId, dto);
  }

  @Get('balance-adjustments')
  findMany(
    @Req() req: AuthenticatedRequest,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ) {
    return this.service.findMany(req.user.id, accountId);
  }

  @Get('balance')
  getBalance(
    @Req() req: AuthenticatedRequest,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query() query: GetAccountBalanceDto,
  ) {
    return this.service.getBalance(
      req.user.id,
      accountId,
      query.asOf ? new Date(query.asOf) : new Date(),
    );
  }
}
