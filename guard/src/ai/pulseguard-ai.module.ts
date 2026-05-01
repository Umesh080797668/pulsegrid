import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ErrorIntelligenceService } from './error-intelligence.service';
import { AutonomousMaintenanceService } from './autonomous-maintenance.service';
import { PredictiveIntelligenceService } from './predictive-intelligence.service';
import { PulseGuardAIController } from './pulseguard-ai.controller';

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    ErrorIntelligenceService,
    AutonomousMaintenanceService,
    PredictiveIntelligenceService,
  ],
  controllers: [PulseGuardAIController],
  exports: [
    ErrorIntelligenceService,
    AutonomousMaintenanceService,
    PredictiveIntelligenceService,
  ],
})
export class PulseGuardAIModule {}
