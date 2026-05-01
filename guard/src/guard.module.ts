import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GuardController } from './guard.controller';
import { GuardStreamsConsumer } from './streams/guard-streams.consumer';
import { AITriageService } from './triage/ai-triage.service';
import { ContextBuilderService } from './triage/context-builder.service';
import { InternetResearchService } from './research/internet-research.service';
import { MaintenanceOrchestratorService } from './maintenance/orchestrator.service';
import { NotificationService } from './notifications/notification.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [GuardController],
  providers: [
    GuardStreamsConsumer,
    AITriageService,
    ContextBuilderService,
    InternetResearchService,
    MaintenanceOrchestratorService,
    NotificationService,
  ],
  exports: [
    GuardStreamsConsumer,
    AITriageService,
    ContextBuilderService,
    InternetResearchService,
    MaintenanceOrchestratorService,
    NotificationService,
  ],
})
export class GuardModule {}
