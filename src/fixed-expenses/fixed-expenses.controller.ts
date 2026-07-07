import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from './dto/update-fixed-expense.dto';
import { FixedExpensesService } from './fixed-expenses.service';

@UseGuards(JwtAuthGuard)
@Controller('fixed-expenses')
export class FixedExpensesController {
  constructor(private readonly fixedExpensesService: FixedExpensesService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createFixedExpenseDto: CreateFixedExpenseDto,
  ) {
    return this.fixedExpensesService.create(
      request.user.id,
      createFixedExpenseDto,
    );
  }

  @Get()
  findMany(@Req() request: AuthenticatedRequest) {
    return this.fixedExpensesService.findMany(request.user.id);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.fixedExpensesService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateFixedExpenseDto: UpdateFixedExpenseDto,
  ) {
    return this.fixedExpensesService.update(
      request.user.id,
      id,
      updateFixedExpenseDto,
    );
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.fixedExpensesService.remove(request.user.id, id);
  }
}

