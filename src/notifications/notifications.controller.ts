import { Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() findMany(@Req() req: AuthenticatedRequest, @Query() query: ListNotificationsDto) { return this.service.findMany(req.user.id, query); }
  @Get('unread-count') unreadCount(@Req() req: AuthenticatedRequest) { return this.service.unreadCount(req.user.id); }
  @Post('read-all') readAll(@Req() req: AuthenticatedRequest) { return this.service.markAllRead(req.user.id); }
  @Patch(':id/read') read(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.markRead(req.user.id, id); }
  @Delete(':id') dismiss(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.dismiss(req.user.id, id); }
}
