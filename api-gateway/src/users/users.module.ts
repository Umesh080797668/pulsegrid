import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DailyDigestService } from './daily-digest.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, DailyDigestService],
  exports: [UsersService, DailyDigestService],
})
export class UsersModule {}
