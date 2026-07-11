import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';
import { ListCreditCardsDto } from './dto/list-credit-cards.dto';

@Injectable()
export class CreditCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCreditCardDto) {
    await this.ensureAccountBelongsToUser(userId, dto.accountId);

    try {
      return await this.prisma.creditCard.create({
        data: { userId, ...dto },
      });
    } catch (error) {
      this.handleUniqueNameError(error);
      throw error;
    }
  }

  findMany(userId: string, query: ListCreditCardsDto) {
    return this.prisma.creditCard.findMany({
      where: { userId, isActive: query.isActive ?? true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const creditCard = await this.prisma.creditCard.findFirst({
      where: { id, userId },
    });

    if (!creditCard) {
      throw new NotFoundException('Credit card not found');
    }

    return creditCard;
  }

  async update(userId: string, id: string, dto: UpdateCreditCardDto) {
    await this.findOne(userId, id);
    await this.ensureAccountBelongsToUser(userId, dto.accountId);

    try {
      return await this.prisma.creditCard.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.handleUniqueNameError(error);
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.creditCard.update({
      where: { id },
      data: { isActive: false },
    });

    return { archived: true };
  }

  private async ensureAccountBelongsToUser(
    userId: string,
    accountId?: string | null,
  ) {
    if (!accountId) return;

    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });

    if (!account) {
      throw new BadRequestException('Invalid accountId');
    }
  }

  private handleUniqueNameError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Credit card name already exists');
    }
  }
}
