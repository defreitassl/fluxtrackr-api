import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ListSubscriptionsDto } from './dto/list-subscriptions.dto';
import { SubscriptionsSummaryDto } from './dto/subscriptions-summary.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}
  @Post() create(@Req() req: AuthenticatedRequest, @Body() dto: CreateSubscriptionDto) { return this.service.create(req.user.id, dto); }
  @Get() findMany(@Req() req: AuthenticatedRequest, @Query() query: ListSubscriptionsDto) { return this.service.findMany(req.user.id, query); }
  @Get('summary') summary(@Req() req: AuthenticatedRequest, @Query() query: SubscriptionsSummaryDto) { return this.service.summary(req.user.id, query.asOf ? new Date(query.asOf) : new Date()); }
  @Get(':id') findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.findOne(req.user.id, id); }
  @Patch(':id') update(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateSubscriptionDto) { return this.service.update(req.user.id, id, dto); }
  @Delete(':id') remove(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.remove(req.user.id, id); }
}
