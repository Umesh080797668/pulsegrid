import { Module } from '@nestjs/common';
import { BetaController } from './beta.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BetaController],
})
export class BetaModule {}
