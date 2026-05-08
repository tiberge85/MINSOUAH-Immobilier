import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PaymentsController, RentPeriodsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [PaymentsController, RentPeriodsController, WebhooksController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
