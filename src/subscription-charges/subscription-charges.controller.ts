import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ListSubscriptionChargesDto } from './dto/list-subscription-charges.dto';
import { RealizeSubscriptionChargeDto } from './dto/realize-subscription-charge.dto';
import { SubscriptionChargesService } from './subscription-charges.service';
@UseGuards(JwtAuthGuard) @Controller('subscription-charges') export class SubscriptionChargesController { constructor(private readonly service: SubscriptionChargesService) {} @Get() findMany(@Req() req: AuthenticatedRequest, @Query() query: ListSubscriptionChargesDto) { return this.service.findMany(req.user.id, query); } @Get(':id') findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.findOne(req.user.id, id); } @Post(':id/realize') realize(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: RealizeSubscriptionChargeDto) { return this.service.realize(req.user.id, id, dto); } @Post(':id/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.cancel(req.user.id, id); } }
