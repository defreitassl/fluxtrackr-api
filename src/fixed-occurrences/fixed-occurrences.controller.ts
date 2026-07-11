import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ListFixedOccurrencesDto } from './dto/list-fixed-occurrences.dto';
import { RealizeFixedOccurrenceDto } from './dto/realize-fixed-occurrence.dto';
import { FixedOccurrencesService } from './fixed-occurrences.service';

@UseGuards(JwtAuthGuard)
@Controller('fixed-occurrences')
export class FixedOccurrencesController {
  constructor(private readonly service: FixedOccurrencesService) {}

  @Get()
  findMany(@Req() req: AuthenticatedRequest, @Query() query: ListFixedOccurrencesDto) {
    return this.service.findMany(req.user.id, query);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Post(':id/realize')
  realize(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: RealizeFixedOccurrenceDto) {
    return this.service.realize(req.user.id, id, dto);
  }

  @Post(':id/cancel')
  cancel(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.cancel(req.user.id, id);
  }
}
