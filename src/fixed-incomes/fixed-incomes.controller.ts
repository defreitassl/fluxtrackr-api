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
import { CreateFixedIncomeDto } from './dto/create-fixed-income.dto';
import { UpdateFixedIncomeDto } from './dto/update-fixed-income.dto';
import { FixedIncomesService } from './fixed-incomes.service';

@UseGuards(JwtAuthGuard)
@Controller('fixed-incomes')
export class FixedIncomesController {
  constructor(private readonly fixedIncomesService: FixedIncomesService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createFixedIncomeDto: CreateFixedIncomeDto,
  ) {
    return this.fixedIncomesService.create(
      request.user.id,
      createFixedIncomeDto,
    );
  }

  @Get()
  findMany(@Req() request: AuthenticatedRequest) {
    return this.fixedIncomesService.findMany(request.user.id);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.fixedIncomesService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateFixedIncomeDto: UpdateFixedIncomeDto,
  ) {
    return this.fixedIncomesService.update(
      request.user.id,
      id,
      updateFixedIncomeDto,
    );
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.fixedIncomesService.remove(request.user.id, id);
  }
}

