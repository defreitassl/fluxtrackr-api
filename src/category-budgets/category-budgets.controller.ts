import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CategoryBudgetsService } from './category-budgets.service';
import { CreateCategoryBudgetDto } from './dto/create-category-budget.dto';
import { GetCategoryBudgetOverviewDto } from './dto/get-category-budget-overview.dto';
import { ListCategoryBudgetsDto } from './dto/list-category-budgets.dto';
import { UpdateCategoryBudgetDto } from './dto/update-category-budget.dto';

@UseGuards(JwtAuthGuard)
@Controller('category-budgets')
export class CategoryBudgetsController {
  constructor(private readonly budgets: CategoryBudgetsService) {}

  @Post() create(@Req() request: AuthenticatedRequest, @Body() dto: CreateCategoryBudgetDto) { return this.budgets.create(request.user.id, dto); }
  @Get() findMany(@Req() request: AuthenticatedRequest, @Query() query: ListCategoryBudgetsDto) { return this.budgets.findMany(request.user.id, query); }
  @Get('overview') overview(@Req() request: AuthenticatedRequest, @Query() query: GetCategoryBudgetOverviewDto) { return this.budgets.overview(request.user.id, query); }
  @Get(':id') findOne(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.budgets.findOne(request.user.id, id); }
  @Patch(':id') update(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCategoryBudgetDto) { return this.budgets.update(request.user.id, id, dto); }
  @Delete(':id') remove(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.budgets.remove(request.user.id, id); }
}
