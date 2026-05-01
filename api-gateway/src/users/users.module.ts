import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DigestScheduler } from './digest.scheduler';
import { AnomalyNotificationService } from './anomaly-notification.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, DigestScheduler, AnomalyNotificationService],
  exports: [UsersService, DigestScheduler, AnomalyNotificationService],
})
export class UsersModule {}

