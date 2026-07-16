import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

@UseGuards(JwtAuthGuard)
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly service: NotificationPreferencesService) {}
  @Get() findAll(@Req() req: AuthenticatedRequest) { return this.service.findAll(req.user.id); }
  @Patch() update(@Req() req: AuthenticatedRequest, @Body() dto: UpdateNotificationPreferencesDto) { return this.service.update(req.user.id, dto); }
}
