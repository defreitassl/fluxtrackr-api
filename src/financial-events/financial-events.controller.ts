import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreateFinancialEventDto } from './dto/create-financial-event.dto';
import { ListFinancialEventsDto } from './dto/list-financial-events.dto';
import { PostponeFinancialEventDto } from './dto/postpone-financial-event.dto';
import { UpdateFinancialEventDto } from './dto/update-financial-event.dto';
import { FinancialEventsService } from './financial-events.service';

@UseGuards(JwtAuthGuard)
@Controller('financial-events')
export class FinancialEventsController {
  constructor(private readonly service: FinancialEventsService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateFinancialEventDto) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  findMany(@Req() req: AuthenticatedRequest, @Query() query: ListFinancialEventsDto) {
    return this.service.findMany(req.user.id, query);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFinancialEventDto,
  ) {
    return this.service.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(req.user.id, id);
  }

  @Post(':id/postpone')
  postpone(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PostponeFinancialEventDto,
  ) {
    return this.service.postpone(req.user.id, id, dto);
  }

  @Post(':id/confirm')
  confirm(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.confirm(req.user.id, id);
  }

  @Post(':id/realize')
  realize(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.realize(req.user.id, id);
  }
}
