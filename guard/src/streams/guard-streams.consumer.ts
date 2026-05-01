import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { GuardEvent } from '../types';
import { AITriageService } from '../triage/ai-triage.service';
import { InternetResearchService } from '../research/internet-research.service';
import { MaintenanceOrchestratorService } from '../maintenance/orchestrator.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class GuardStreamsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('GuardStreamsConsumer');
  private redis: Redis | null = null;
  private consumerRunning = false;

  constructor(
    private aiTriageService: AITriageService,
    private researchService: InternetResearchService,
    private maintenanceOrchestratorService: MaintenanceOrchestratorService,
    private notificationService: NotificationService,
  ) {}

  async onModuleInit() {
    await this.startConsumer();
  }

  async onModuleDestroy() {
    this.consumerRunning = false;
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  private async startConsumer() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
      this.redis = new Redis(redisUrl);

      // Create consumer group if it doesn't exist
      try {
        await this.redis.xgroup(
          'CREATE',
          'guard:events',
          'guard:consumer:triage',
          '$',
          'MKSTREAM',
        );
        this.logger.log('Created consumer group guard:consumer:triage');
      } catch (err: any) {
        // Group might already exist
        if (!err.message.includes('BUSYGROUP')) {
          this.logger.warn('Could not create consumer group', err.message);
        }
      }

      this.consumerRunning = true;
      this.consumeEvents();
    } catch (err) {
      this.logger.error('Failed to start consumer', err);
      setTimeout(() => this.startConsumer(), 5000);
    }
  }

  private async consumeEvents() {
    while (this.consumerRunning) {
      try {
        // Read from consumer group with 5-second block
        const messages = (await this.redis!.xreadgroup(
          'GROUP',
          'guard:consumer:triage',
          `guard-consumer-${process.pid}`,
          'BLOCK',
          '5000',
          'STREAMS',
          'guard:events',
          '>',
        )) as Array<[string, Array<[string, string[]]>]> | null;

        if (!messages || messages.length === 0) {
          continue;
        }

        for (const [, streamMessages] of messages) {
          for (const [messageId, data] of streamMessages) {
            try {
              await this.processGuardEvent(messageId, data);
              // Acknowledge the message
              await this.redis!.xack(
                'guard:events',
                'guard:consumer:triage',
                messageId,
              );
            } catch (err) {
              this.logger.error(
                `Error processing guard event ${messageId}`,
                err,
              );
            }
          }
        }
      } catch (err: any) {
        if (!err.message.includes('NOGROUP')) {
          this.logger.error('Error in consumer loop', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async processGuardEvent(messageId: string, data: string[]) {
    try {
      // Data is an array of [key, value, key, value, ...]
      const payloadIndex = data.indexOf('payload');
      if (payloadIndex === -1) {
        this.logger.warn(`No payload in message ${messageId}`);
        return;
      }

      const guardEventData = JSON.parse(data[payloadIndex + 1]);
      const guardEvent: GuardEvent = guardEventData;

      this.logger.debug(
        `Processing guard event ${guardEvent.id} from ${guardEvent.source}`,
      );

      // Step 1: AI Triage
      const triageResult = await this.aiTriageService.triage(guardEvent);

      // Step 2: Internet Research (async, doesn't block)
      const researchResult = await this.researchService.research(
        guardEvent,
        triageResult,
      );

      // Step 3: Maintenance Orchestration
      const maintenanceResult =
        await this.maintenanceOrchestratorService.execute(
          guardEvent,
          triageResult,
        );

      // Step 4: Notifications
      if (
        triageResult.severity_recommendation === 'error' ||
        triageResult.severity_recommendation === 'critical'
      ) {
        await this.notificationService.sendSlackAlert({
          guardEvent,
          triageResult,
          researchResult,
          maintenanceResult,
        });
      }

      this.logger.log(
        `Processed guard event ${guardEvent.id}: severity=${triageResult.severity_recommendation} confidence=${triageResult.confidence}`,
      );
    } catch (err) {
      this.logger.error('Failed to process guard event', err);
    }
  }
}
