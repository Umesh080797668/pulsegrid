import { Module } from '@nestjs/common';
import { GuardIngestController } from './guard-ingest.controller';

@Module({
  controllers: [GuardIngestController],
  providers: [],
  exports: [],
})
export class GuardIngestModule {}
