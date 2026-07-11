import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { DashboardOverviewService } from './dashboard-overview.service';
import { GetDashboardOverviewDto } from './dto/get-dashboard-overview.dto';

@UseGuards(JwtAuthGuard)
@Controller('dashboard-overview')
export class DashboardOverviewController {
  constructor(private readonly dashboardOverview: DashboardOverviewService) {}

  @Get()
  getOverview(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetDashboardOverviewDto,
  ) {
    return this.dashboardOverview.getOverview(request.user.id, query);
  }
}
