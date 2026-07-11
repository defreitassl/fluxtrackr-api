import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ListFinancialTimelineDto } from './dto/list-financial-timeline.dto';
import { FinancialTimelineService } from './financial-timeline.service';

@UseGuards(JwtAuthGuard)
@Controller('financial-timeline')
export class FinancialTimelineController {
  constructor(private readonly service: FinancialTimelineService) {}

  @Get()
  findMany(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListFinancialTimelineDto,
  ) {
    return this.service.findMany(request.user.id, query);
  }
}
