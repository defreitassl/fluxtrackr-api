import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FixedOccurrencesMaterializerService } from '../fixed-occurrences/fixed-occurrences-materializer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFixedIncomeDto } from './dto/create-fixed-income.dto';
import { UpdateFixedIncomeDto } from './dto/update-fixed-income.dto';

@Injectable()
export class FixedIncomesService {
  constructor(private readonly prisma: PrismaService, private readonly materializer: FixedOccurrencesMaterializerService) {}

  async create(userId: string, createFixedIncomeDto: CreateFixedIncomeDto) {
    await this.validateDefaults(this.prisma, userId, createFixedIncomeDto.categoryId, createFixedIncomeDto.accountId, createFixedIncomeDto.paymentMethod);
    const template = await this.prisma.fixedIncome.create({
      data: {
        userId,
        name: createFixedIncomeDto.name,
        amount: createFixedIncomeDto.amount,
        receiveDay: createFixedIncomeDto.receiveDay,
        isActive: createFixedIncomeDto.isActive ?? true,
        categoryId: createFixedIncomeDto.categoryId,
        accountId: createFixedIncomeDto.accountId,
        paymentMethod: createFixedIncomeDto.paymentMethod,
      },
    });
    await this.materializer.materializeIncome(template);
    return template;
  }

  findMany(userId: string) {
    return this.prisma.fixedIncome.findMany({
      where: { userId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const fixedIncome = await this.prisma.fixedIncome.findFirst({
      where: { id, userId },
    });

    if (!fixedIncome) {
      throw new NotFoundException('Fixed income not found');
    }

    return fixedIncome;
  }

  async update(
    userId: string,
    id: string,
    updateFixedIncomeDto: UpdateFixedIncomeDto,
  ) {
    const current = await this.findOne(userId, id);
    const categoryId = updateFixedIncomeDto.categoryId === undefined ? current.categoryId : updateFixedIncomeDto.categoryId;
    const accountId = updateFixedIncomeDto.accountId === undefined ? current.accountId : updateFixedIncomeDto.accountId;
    const paymentMethod = updateFixedIncomeDto.paymentMethod === undefined ? current.paymentMethod : updateFixedIncomeDto.paymentMethod;
    await this.validateDefaults(this.prisma, userId, categoryId, accountId, paymentMethod);
    const template = await this.prisma.fixedIncome.update({
      where: { id },
      data: updateFixedIncomeDto,
    });
    await this.materializer.materializeIncome(template);
    return template;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.fixedIncome.update({ where: { id }, data: { isActive: false } });
    return { archived: true };
  }

  private async validateDefaults(tx: Prisma.TransactionClient | PrismaService, userId: string, categoryId?: string | null, accountId?: string | null, paymentMethod?: string | null) {
    if (accountId && paymentMethod === 'credit') throw new BadRequestException('Account fixed income does not accept credit paymentMethod');
    if (categoryId) {
      const category = await tx.category.findFirst({ where: { id: categoryId, userId, type: { in: ['income', 'both'] } }, select: { id: true } });
      if (!category) throw new BadRequestException('Invalid categoryId');
    }
    if (accountId) {
      const account = await tx.account.findFirst({ where: { id: accountId, userId, isActive: true }, select: { id: true } });
      if (!account) throw new BadRequestException('Invalid accountId');
    }
  }
}
