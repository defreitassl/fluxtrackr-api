import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FixedOccurrencesMaterializerService } from '../fixed-occurrences/fixed-occurrences-materializer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from './dto/update-fixed-expense.dto';

@Injectable()
export class FixedExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly materializer: FixedOccurrencesMaterializerService) {}

  async create(userId: string, createFixedExpenseDto: CreateFixedExpenseDto) {
    await this.validateDefaults(this.prisma, userId, createFixedExpenseDto.categoryId, createFixedExpenseDto.accountId, createFixedExpenseDto.paymentMethod);
    const template = await this.prisma.fixedExpense.create({
      data: {
        userId,
        name: createFixedExpenseDto.name,
        amount: createFixedExpenseDto.amount,
        dueDay: createFixedExpenseDto.dueDay,
        isActive: createFixedExpenseDto.isActive ?? true,
        categoryId: createFixedExpenseDto.categoryId,
        accountId: createFixedExpenseDto.accountId,
        paymentMethod: createFixedExpenseDto.paymentMethod,
      },
    });
    await this.materializer.materializeExpense(template);
    return template;
  }

  findMany(userId: string) {
    return this.prisma.fixedExpense.findMany({
      where: { userId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const fixedExpense = await this.prisma.fixedExpense.findFirst({
      where: { id, userId },
    });

    if (!fixedExpense) {
      throw new NotFoundException('Fixed expense not found');
    }

    return fixedExpense;
  }

  async update(
    userId: string,
    id: string,
    updateFixedExpenseDto: UpdateFixedExpenseDto,
  ) {
    const current = await this.findOne(userId, id);
    const categoryId = updateFixedExpenseDto.categoryId === undefined ? current.categoryId : updateFixedExpenseDto.categoryId;
    const accountId = updateFixedExpenseDto.accountId === undefined ? current.accountId : updateFixedExpenseDto.accountId;
    const paymentMethod = updateFixedExpenseDto.paymentMethod === undefined ? current.paymentMethod : updateFixedExpenseDto.paymentMethod;
    await this.validateDefaults(this.prisma, userId, categoryId, accountId, paymentMethod);
    const template = await this.prisma.fixedExpense.update({
      where: { id },
      data: updateFixedExpenseDto,
    });
    await this.materializer.materializeExpense(template);
    return template;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.fixedExpense.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }

  private async validateDefaults(tx: Prisma.TransactionClient | PrismaService, userId: string, categoryId?: string | null, accountId?: string | null, paymentMethod?: string | null) {
    if (accountId && paymentMethod === 'credit') throw new BadRequestException('Account fixed expense does not accept credit paymentMethod');
    if (categoryId) {
      const category = await tx.category.findFirst({ where: { id: categoryId, userId, type: { in: ['expense', 'both'] } }, select: { id: true } });
      if (!category) throw new BadRequestException('Invalid categoryId');
    }
    if (accountId) {
      const account = await tx.account.findFirst({ where: { id: accountId, userId, isActive: true }, select: { id: true } });
      if (!account) throw new BadRequestException('Invalid accountId');
    }
  }
}
