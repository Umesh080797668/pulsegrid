import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

@Injectable()
export class MarketReviewWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('MarketReviewWorker');
  private running = false;
  private pool: Pool | null = null;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
    const connectionString = process.env.DATABASE_URL || '';
    if (connectionString) {
      this.pool = new Pool({ connectionString });
      void this.ensureSchema();
    }
  }

  async onModuleInit(): Promise<void> {
    this.running = true;
    this.loop();
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.pool) {
      this.pool.end().catch(() => {});
    }
  }

  private async ensureSchema(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS template_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID NOT NULL,
        user_id UUID,
        rating INT NOT NULL,
        review_text TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.redis.brpop('queue:market:review', 5);
        if (!result) continue;

        const payloadStr = result[1];
        let payload: any;
        try {
          payload = JSON.parse(payloadStr);
        } catch (err) {
          this.logger.warn('Invalid JSON in market review queue, skipping');
          continue;
        }

        const templateId = payload?.template_id;
        const workspaceId = payload?.creator_workspace_id;

        if (!templateId) {
          this.logger.warn('Market review payload missing template_id');
          continue;
        }

        const flowDefRow = await this.pool?.query('SELECT flow_definition FROM market_templates WHERE id = $1', [templateId]);
        const flowDef = flowDefRow?.rows?.[0]?.flow_definition;

        const review = this.runStaticSandboxChecks(flowDef);

        // Insert review record
        await this.pool?.query('INSERT INTO template_reviews (template_id, user_id, rating, review_text) VALUES ($1, $2, $3, $4)', [templateId, null, review.rating, review.message]);

        // Publish result to workspace event stream if workspaceId present
        if (workspaceId) {
          const streamKey = `stream:events:${workspaceId}`;
          const event = {
            id: `review-${templateId}-${Date.now()}`,
            tenant_id: workspaceId,
            event_type: 'market_template_review',
            data: { template_id: templateId, rating: review.rating, message: review.message },
            timestamp: new Date().toISOString(),
            schema_version: '1.0',
          };
          try {
            await this.redis.xadd(streamKey, '*', 'payload', JSON.stringify(event));
          } catch (err) {
            this.logger.warn('Failed to publish template review event to stream', err);
          }
        }

        this.logger.log(`Processed market review for template ${templateId} rating=${review.rating}`);
      } catch (err) {
        this.logger.error('Error in market review worker loop', err);
        // small sleep to avoid busy-loop on persistent error
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  private runStaticSandboxChecks(flowDefinition: any): { rating: number; message: string } {
    if (!flowDefinition) {
      return { rating: 1, message: 'Empty flow definition' };
    }

    const asString = typeof flowDefinition === 'string' ? flowDefinition : JSON.stringify(flowDefinition);
    const banned = ['child_process', 'exec(', 'spawn(', 'fs.', 'fs/', 'require("fs")', "require('fs')", 'net.', 'http.request', 'eval(', 'Function('];
    const found = banned.filter((b) => asString.includes(b));
    if (found.length > 0) {
      return { rating: 1, message: `Static sandbox checks failed: ${found.join(', ')}` };
    }

    return { rating: 5, message: 'Auto-approved by static sandbox scanner' };
  }
}
