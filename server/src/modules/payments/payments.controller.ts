import { Controller, Get, Post, Patch, Param, Body, Query, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Paiements')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Get()
  findAll(@CurrentUser('orgId') orgId: string, @Query() query: any) {
    return this.service.findAll(orgId, query);
  }

  @Post()
  record(@CurrentUser('orgId') orgId: string, @CurrentUser('id') userId: string, @Body() dto: any) {
    return this.service.recordPayment(orgId, dto, userId);
  }

  @Post('mobile-money')
  initiateMM(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    return this.service.initiateMoneyMobile(orgId, dto);
  }
}

@ApiTags('Paiements — Périodes')
@ApiBearerAuth()
@Controller('rent-periods')
export class RentPeriodsController {
  constructor(private service: PaymentsService) {}

  @Get()
  findAll(@CurrentUser('orgId') orgId: string, @Query() query: any) {
    return this.service.findRentPeriods(orgId, query);
  }

  @Patch(':id/paid')
  markPaid(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.markPeriodPaid(id, orgId);
  }

  @Post(':id/reminder')
  sendReminder(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.sendReminder(id, orgId);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private service: PaymentsService) {}

  @Public()
  @Post('cinetpay')
  cinetpay(@Body() payload: any) {
    return this.service.handleCinetPayWebhook(payload);
  }
}
