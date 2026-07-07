import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { MonthlySummaryQueryDto } from './dto/monthly-summary-query.dto';
import { MonthlySummaryService } from './monthly-summary.service';

@UseGuards(JwtAuthGuard)
@Controller('monthly-summary')
export class MonthlySummaryController {
  constructor(private readonly monthlySummaryService: MonthlySummaryService) {}

  @Get()
  getSummary(
    @Req() request: AuthenticatedRequest,
    @Query() query: MonthlySummaryQueryDto,
  ) {
    return this.monthlySummaryService.getSummary(request.user.id, query);
  }
}

