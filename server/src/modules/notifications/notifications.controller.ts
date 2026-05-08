import { Controller, Post, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Post('bulk-reminder')
  bulkReminder(@CurrentUser('orgId') orgId: string) {
    return this.service.sendBulkReminders(orgId);
  }

  @Get('logs')
  logs(@CurrentUser('orgId') orgId: string, @Query() query: any) {
    return this.service.getLogs(orgId, query);
  }
}
