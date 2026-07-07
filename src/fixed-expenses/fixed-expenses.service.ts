import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from './dto/update-fixed-expense.dto';

@Injectable()
export class FixedExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, createFixedExpenseDto: CreateFixedExpenseDto) {
    return this.prisma.fixedExpense.create({
      data: {
        userId,
        name: createFixedExpenseDto.name,
        amount: createFixedExpenseDto.amount,
        dueDay: createFixedExpenseDto.dueDay,
        isActive: createFixedExpenseDto.isActive ?? true,
      },
    });
  }

  findMany(userId: string) {
    return this.prisma.fixedExpense.findMany({
      where: { userId },
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
    await this.findOne(userId, id);

    return this.prisma.fixedExpense.update({
      where: { id },
      data: updateFixedExpenseDto,
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.fixedExpense.delete({ where: { id } });

    return { deleted: true };
  }
}

