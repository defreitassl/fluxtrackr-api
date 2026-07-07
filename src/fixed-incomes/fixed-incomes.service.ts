import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFixedIncomeDto } from './dto/create-fixed-income.dto';
import { UpdateFixedIncomeDto } from './dto/update-fixed-income.dto';

@Injectable()
export class FixedIncomesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, createFixedIncomeDto: CreateFixedIncomeDto) {
    return this.prisma.fixedIncome.create({
      data: {
        userId,
        name: createFixedIncomeDto.name,
        amount: createFixedIncomeDto.amount,
        receiveDay: createFixedIncomeDto.receiveDay,
        isActive: createFixedIncomeDto.isActive ?? true,
      },
    });
  }

  findMany(userId: string) {
    return this.prisma.fixedIncome.findMany({
      where: { userId },
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
    await this.findOne(userId, id);

    return this.prisma.fixedIncome.update({
      where: { id },
      data: updateFixedIncomeDto,
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.fixedIncome.delete({ where: { id } });

    return { deleted: true };
  }
}

