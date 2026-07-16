import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryBudgetSpendingService, getBudgetStatus } from './category-budget-spending.service';
import { CreateCategoryBudgetDto } from './dto/create-category-budget.dto';
import { GetCategoryBudgetOverviewDto } from './dto/get-category-budget-overview.dto';
import { ListCategoryBudgetsDto } from './dto/list-category-budgets.dto';
import { UpdateCategoryBudgetDto } from './dto/update-category-budget.dto';

const zero = () => new Prisma.Decimal(0);

@Injectable()
export class CategoryBudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spending: CategoryBudgetSpendingService,
  ) {}

  async create(userId: string, dto: CreateCategoryBudgetDto) {
    await this.ensureCategory(userId, dto.categoryId);
    try {
      const budget = await this.prisma.categoryBudget.create({
        data: {
          userId, categoryId: dto.categoryId, year: dto.year, month: dto.month,
          limitAmount: this.parseLimit(dto.limitAmount),
          warningPercentage: dto.warningPercentage ?? 80,
        },
        include: { category: true },
      });
      return this.serialize(budget);
    } catch (error) {
      this.handleConflict(error);
      throw error;
    }
  }

  async findMany(userId: string, query: ListCategoryBudgetsDto) {
    const budgets = await this.prisma.categoryBudget.findMany({
      where: {
        userId, year: query.year, month: query.month, categoryId: query.categoryId,
        isActive: query.isActive ?? true,
      },
      include: { category: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { category: { name: 'asc' } }, { id: 'asc' }],
    });
    return budgets.map((budget) => this.serialize(budget));
  }

  async findOne(userId: string, id: string) {
    const budget = await this.prisma.categoryBudget.findFirst({ where: { id, userId }, include: { category: true } });
    if (!budget) throw new NotFoundException('Category budget not found');
    return this.serialize(budget);
  }

  async update(userId: string, id: string, dto: UpdateCategoryBudgetDto) {
    const current = await this.prisma.categoryBudget.findFirst({ where: { id, userId } });
    if (!current) throw new NotFoundException('Category budget not found');
    const categoryId = dto.categoryId ?? current.categoryId;
    await this.ensureCategory(userId, categoryId);
    try {
      const budget = await this.prisma.categoryBudget.update({
        where: { id },
        data: {
          categoryId,
          year: dto.year ?? current.year,
          month: dto.month ?? current.month,
          limitAmount: dto.limitAmount === undefined ? current.limitAmount : this.parseLimit(dto.limitAmount),
          warningPercentage: dto.warningPercentage ?? current.warningPercentage,
          isActive: dto.isActive ?? current.isActive,
        },
        include: { category: true },
      });
      return this.serialize(budget);
    } catch (error) {
      this.handleConflict(error);
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.categoryBudget.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }

  async overview(userId: string, query: GetCategoryBudgetOverviewDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new BadRequestException('asOf must be a valid ISO date');
    const budgets = await this.prisma.categoryBudget.findMany({
      where: { userId, year: query.year, month: query.month, isActive: true },
      include: { category: true },
      orderBy: [{ category: { name: 'asc' } }, { id: 'asc' }],
    });
    const spending = await this.spending.getSpendingByCategory(userId, query.year, query.month, asOf);
    const result = budgets.map((budget) => {
      const values = spending.get(budget.categoryId) ?? {
        transactionSpent: zero(), creditCardSpent: zero(), totalSpent: zero(),
      };
      const remainingAmount = budget.limitAmount.minus(values.totalSpent);
      const usagePercentage = values.totalSpent.dividedBy(budget.limitAmount).times(100);
      return {
        id: budget.id,
        category: { id: budget.category.id, name: budget.category.name, type: budget.category.type },
        limitAmount: budget.limitAmount.toFixed(2),
        warningPercentage: budget.warningPercentage,
        transactionSpent: values.transactionSpent.toFixed(2),
        creditCardSpent: values.creditCardSpent.toFixed(2),
        spentAmount: values.totalSpent.toFixed(2),
        remainingAmount: remainingAmount.toFixed(2),
        usagePercentage: usagePercentage.toFixed(2),
        status: getBudgetStatus(values.totalSpent, budget.limitAmount, budget.warningPercentage),
      };
    });
    return {
      year: query.year,
      month: query.month,
      asOf: asOf.toISOString(),
      summary: this.spending.buildSummary(budgets, spending),
      budgets: result,
    };
  }

  private async ensureCategory(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId, type: { in: ['expense', 'both'] } },
      select: { id: true },
    });
    if (!category) throw new BadRequestException('Invalid categoryId');
  }

  private parseLimit(value: string) {
    const limit = new Prisma.Decimal(value);
    if (limit.lessThanOrEqualTo(0)) throw new BadRequestException('limitAmount must be greater than zero');
    return limit;
  }

  private serialize(budget: any) {
    return {
      ...budget,
      limitAmount: budget.limitAmount.toFixed(2),
      category: budget.category ? { id: budget.category.id, name: budget.category.name, type: budget.category.type } : undefined,
    };
  }

  private handleConflict(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Category budget already exists for this category and month');
    }
  }
}
