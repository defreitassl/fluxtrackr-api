import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { BalanceForecastService } from './balance-forecast.service';
import { GetBalanceForecastDto } from './dto/get-balance-forecast.dto';

@UseGuards(JwtAuthGuard)
@Controller('balance-forecast')
export class BalanceForecastController {
  constructor(private readonly service: BalanceForecastService) {}

  @Get()
  getForecast(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetBalanceForecastDto,
  ) {
    return this.service.getForecast(request.user.id, query);
  }
}
