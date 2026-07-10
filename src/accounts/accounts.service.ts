import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createAccountDto: CreateAccountDto) {
    try {
      return await this.prisma.account.create({
        data: {
          userId,
          name: createAccountDto.name,
          bank: createAccountDto.bank,
          type: createAccountDto.type,
          color: createAccountDto.color,
          icon: createAccountDto.icon,
          initialBalance: createAccountDto.initialBalance,
          isActive: createAccountDto.isActive,
        },
      });
    } catch (error) {
      this.handleUniqueNameError(error);
      throw error;
    }
  }

  findMany(userId: string) {
    return this.prisma.account.findMany({
      where: { userId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }

  async update(userId: string, id: string, updateAccountDto: UpdateAccountDto) {
    await this.findOne(userId, id);

    try {
      return await this.prisma.account.update({
        where: { id },
        data: updateAccountDto,
      });
    } catch (error) {
      this.handleUniqueNameError(error);
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.account.delete({ where: { id } });

    return { deleted: true };
  }

  private handleUniqueNameError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Account name already exists');
    }
  }
}
