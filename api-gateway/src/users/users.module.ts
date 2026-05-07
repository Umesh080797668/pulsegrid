import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DigestScheduler } from './digest.scheduler';
import { DailyDigestService } from './daily-digest.service';
import { AnomalyNotificationService } from './anomaly-notification.service';
import { DigestReportService } from './digest-report.service';
import { DigestReportController } from './digest-report.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, DigestReportController],
  providers: [UsersService, DigestScheduler, DailyDigestService, AnomalyNotificationService, DigestReportService],
  exports: [UsersService, DigestScheduler, DailyDigestService, AnomalyNotificationService, DigestReportService],
})
export class UsersModule {}

