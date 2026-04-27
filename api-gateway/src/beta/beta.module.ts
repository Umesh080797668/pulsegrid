import { Module } from '@nestjs/common';
import { BetaController } from './beta.controller';

@Module({
  controllers: [BetaController],
})
export class BetaModule {}
