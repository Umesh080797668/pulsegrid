import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GuardController } from './guard.controller';
import { GuardStreamsConsumer } from './streams/guard-streams.consumer';
import { AITriageService } from './triage/ai-triage.service';
import { ContextBuilderService } from './triage/context-builder.service';
import { InternetResearchService } from './research/internet-research.service';
import { MaintenanceOrchestratorService } from './maintenance/orchestrator.service';
import { NotificationService } from './notifications/notification.service';
import { PulseGuardAIModule } from './ai/pulseguard-ai.module';
import { GuardGithubActionService } from './actions/github-action.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot(), PulseGuardAIModule],
  controllers: [GuardController],
  providers: [
    GuardStreamsConsumer,
    AITriageService,
    ContextBuilderService,
    InternetResearchService,
    MaintenanceOrchestratorService,
    NotificationService,
    GuardGithubActionService,
  ],
  exports: [
    GuardStreamsConsumer,
    AITriageService,
    ContextBuilderService,
    InternetResearchService,
    MaintenanceOrchestratorService,
    NotificationService,
    GuardGithubActionService,
    PulseGuardAIModule,
  ],
})
export class GuardModule {}
