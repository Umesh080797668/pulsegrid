import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EmailService, FlowFailureAlert } from '../email/email.service';

@Injectable()
export class EmailFailureWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailFailureWorker.name);
  private interval: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit(): void {
    void this.drainQueue();
    this.interval = setInterval(() => {
      void this.drainQueue();
    }, 5000);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;
    try {
      while (true) {
        const raw = await this.redis.lpop('queue:email:failure');
        if (!raw) {
          break;
        }

        try {
          const payload = JSON.parse(raw) as FlowFailureAlert;
          const sent = await this.emailService.sendFlowFailureAlert(payload);
          if (!sent) {
            this.logger.warn(`Failed to send flow failure alert for ${payload.workspace_id}/${payload.flow_name}`);
          }
        } catch (error) {
          this.logger.error('Failed to process queue:email:failure item', error instanceof Error ? error.stack : String(error));
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
