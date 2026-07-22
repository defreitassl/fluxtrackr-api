import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { MeService } from './me.service';

@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  @Get()
  getMe(@Req() req: AuthenticatedRequest) {
    return this.service.getMe(req.user.id);
  }

  @Patch()
  updateMe(@Req() req: AuthenticatedRequest, @Body() dto: UpdateMeDto) {
    return this.service.updateMe(req.user.id, dto);
  }

  @Patch('password')
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.service.changePassword(req.user.id, dto);
  }
}
