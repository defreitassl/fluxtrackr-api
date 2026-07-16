import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreateFinancialGoalDto } from './dto/create-financial-goal.dto';
import { CreateGoalContributionDto } from './dto/create-goal-contribution.dto';
import { GetFinancialGoalsOverviewDto } from './dto/get-financial-goals-overview.dto';
import { ListFinancialGoalsDto, ListGoalContributionsDto } from './dto/list-financial-goals.dto';
import { UpdateFinancialGoalDto } from './dto/update-financial-goal.dto';
import { FinancialGoalsService } from './financial-goals.service';

@UseGuards(JwtAuthGuard)
@Controller('financial-goals')
export class FinancialGoalsController {
  constructor(private readonly service: FinancialGoalsService) {}

  @Post() create(@Req() req: AuthenticatedRequest, @Body() dto: CreateFinancialGoalDto) { return this.service.create(req.user.id, dto); }
  @Get() findMany(@Req() req: AuthenticatedRequest, @Query() query: ListFinancialGoalsDto) { return this.service.findMany(req.user.id, query); }
  @Get('overview') overview(@Req() req: AuthenticatedRequest, @Query() query: GetFinancialGoalsOverviewDto) { return this.service.overview(req.user.id, query); }
  @Get(':id') findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.findOne(req.user.id, id); }
  @Patch(':id') update(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateFinancialGoalDto) { return this.service.update(req.user.id, id, dto); }
  @Delete(':id') remove(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.remove(req.user.id, id); }
  @Post(':id/contributions') addContribution(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateGoalContributionDto) { return this.service.addContribution(req.user.id, id, dto); }
  @Get(':id/contributions') listContributions(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: ListGoalContributionsDto) { return this.service.listContributions(req.user.id, id, query); }
}
