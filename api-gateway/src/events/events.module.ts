import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EmailFailureWorker } from './email-failure.worker';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [EventsController],
  providers: [EventsService, EmailFailureWorker],
  exports: [EventsService],
})
export class EventsModule {}
