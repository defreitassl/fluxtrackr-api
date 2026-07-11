import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { AccountTransfersService } from './account-transfers.service';
import { CreateAccountTransferDto } from './dto/create-account-transfer.dto';
import { ListAccountTransfersDto } from './dto/list-account-transfers.dto';

@UseGuards(JwtAuthGuard)
@Controller('account-transfers')
export class AccountTransfersController {
  constructor(private readonly service: AccountTransfersService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAccountTransferDto) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  findMany(@Req() req: AuthenticatedRequest, @Query() query: ListAccountTransfersDto) {
    return this.service.findMany(req.user.id, query);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(req.user.id, id);
  }
}
