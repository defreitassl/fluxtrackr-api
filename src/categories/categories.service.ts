import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activities/activity.service';
import { NotificationImpactService } from '../notifications/notification-impact.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService, private readonly activities?: ActivityService, private readonly impacts?: NotificationImpactService) {}

  async create(userId: string, createCategoryDto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: {
          userId,
          name: createCategoryDto.name,
          type: createCategoryDto.type,
        },
      });
    } catch (error) {
      this.handleUniqueNameError(error);
      throw error;
    }
  }

  findMany(userId: string, query: ListCategoriesDto = {}) {
    return this.prisma.category.findMany({
      where: { userId, isActive: query.isActive ?? true, type: query.type },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const result = await this.runSerializableTransaction(async (tx) => {
      const current = await tx.category.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException('Category not found');
      const nextType = dto.type ?? current.type;
      const changesToIncome = nextType === 'income' && current.type !== 'income';
      if (changesToIncome) {
        const activeBudget = await tx.categoryBudget.findFirst({ where: { categoryId: id, userId, isActive: true }, select: { id: true } });
        if (activeBudget) throw new ConflictException('Category with active budgets cannot be changed to income');
      }
      if (dto.isActive === false) return { archived: await this.archive(tx, userId, id), category: null };
      try {
        const category = await tx.category.update({
          where: { id },
          data: { name: dto.name, type: dto.type, isActive: dto.isActive },
        });
        if (current.isActive === false && category.isActive) await this.activities?.record(tx, { userId, type: 'category_reactivated', entityType: 'category', entityId: id, title: 'Categoria reativada', description: category.name, occurredAt: new Date() });
        return { category, archived: null };
      } catch (error) {
        this.handleUniqueNameError(error);
        throw error;
      }
    });
    if (result.archived) for (const budgetId of result.archived.budgetIds) await this.impacts?.evaluateBudget(userId, budgetId);
    return result.archived ? { archived: true } : result.category;
  }

  async remove(userId: string, id: string) {
    const archived = await this.runSerializableTransaction(async (tx) => {
      const category = await tx.category.findFirst({ where: { id, userId }, select: { id: true } });
      if (!category) throw new NotFoundException('Category not found');
      return this.archive(tx, userId, id);
    });
    for (const budgetId of archived.budgetIds) await this.impacts?.evaluateBudget(userId, budgetId);
    return { archived: true };
  }

  private async archive(tx: Prisma.TransactionClient, userId: string, id: string) {
    const category = await tx.category.update({ where: { id }, data: { isActive: false } });
    const budgets = tx.categoryBudget.findMany ? await tx.categoryBudget.findMany({ where: { categoryId: id, userId, isActive: true }, select: { id: true } }) : [];
    await tx.categoryBudget.updateMany({ where: budgets.length ? { id: { in: budgets.map((item) => item.id) } } : { categoryId: id, userId, isActive: true }, data: { isActive: false } });
    await this.activities?.record(tx, { userId, type: 'category_archived', entityType: 'category', entityId: id, title: 'Categoria arquivada', description: category.name, occurredAt: new Date() });
    return { budgetIds: budgets.map((item) => item.id) };
  }

  private async runSerializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) continue;
          throw new ConflictException('Category update conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('Category update conflict');
  }

  private handleUniqueNameError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Category name already exists');
    }
  }
}
