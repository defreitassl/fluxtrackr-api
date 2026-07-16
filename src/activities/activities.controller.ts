import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ActivitiesService } from './activities.service';
import { ListActivitiesDto } from './dto/list-activities.dto';
@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivitiesController { constructor(private readonly service: ActivitiesService) {} @Get() findMany(@Req() req: AuthenticatedRequest, @Query() query: ListActivitiesDto) { return this.service.findMany(req.user.id, query); } }
