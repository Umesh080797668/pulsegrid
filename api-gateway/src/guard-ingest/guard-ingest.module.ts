import { Module } from '@nestjs/common';
import { GuardIngestController, GuardEventDto } from './guard-ingest.controller';

@Module({
  controllers: [GuardIngestController],
  providers: [],
  exports: [GuardEventDto],
})
export class GuardIngestModule {}
