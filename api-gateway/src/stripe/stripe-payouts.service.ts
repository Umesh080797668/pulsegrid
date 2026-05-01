import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import Stripe from 'stripe';
import { StripeConnectService } from './stripe-connect.module';

type RedisStreamEntry = [string, string[]];

@Injectable()
export class StripePayoutsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('StripePayoutsService');
  private pollInterval: NodeJS.Timeout | null = null;
  private stripe: Stripe;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly stripeConnectService: StripeConnectService,
  ) {
    // Create local stripe client using same secret key
    const apiKey = process.env.STRIPE_SECRET_KEY || '';
    this.stripe = new Stripe(apiKey, { apiVersion: '2022-11-15' });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
    this.startPolling();
  }

  onModuleDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      try {
        await this.pollStreams();
      } catch (err) {
        this.logger.error('Error polling streams for Stripe events', err);
      }
    }, 5000);
  }

  private async ensureSchema(): Promise<void> {
    const pool = this.stripeConnectService.getDbPool();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stripe_payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stripe_payout_id TEXT,
        connected_account_id TEXT NOT NULL,
        workspace_id UUID,
        amount_cents BIGINT NOT NULL,
        currency TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      )
    `);
  }

  private async pollStreams(): Promise<void> {
    const streamKeys = await this.redis.keys('stream:events:*');

    for (const streamKey of streamKeys) {
      const entries = (await this.redis.xrevrange(streamKey, '+', '-', 'COUNT', 50)) as RedisStreamEntry[];

      for (const [entryId, fieldValues] of entries) {
        try {
          const payloadIndex = fieldValues.findIndex((v) => v === 'payload');
          if (payloadIndex < 0 || payloadIndex + 1 >= fieldValues.length) continue;

          const payloadJson = fieldValues[payloadIndex + 1];
          const normalized = JSON.parse(payloadJson) as any;

          if (normalized?.event_type !== 'webhook') continue;

          const stripeEvent = normalized.data as any;
          if (!stripeEvent || typeof stripeEvent.type !== 'string') continue;

          if (stripeEvent.type !== 'checkout.session.completed' && stripeEvent.type !== 'payment_intent.succeeded') {
            continue;
          }

          // Attempt to find destination connected account id
          const obj = stripeEvent.data?.object ?? stripeEvent; // fallback
          const connectedAccountId = obj?.transfer_data?.destination || obj?.transfer?.destination || obj?.charges?.data?.[0]?.transfer_data?.destination;
          const amount = obj?.amount_received ?? obj?.amount_paid ?? obj?.amount;
          const currency = (obj?.currency || 'usd').toLowerCase();

          if (!connectedAccountId || !amount) {
            this.logger.debug(`Stripe event without connected account or amount: ${stripeEvent.type}`);
            continue;
          }

          // Avoid duplicate payouts by checking if a payout for this event+account exists
          const pool = this.stripeConnectService.getDbPool();
          if (!pool) continue;

          const already = await pool.query(
            'SELECT id FROM stripe_payouts WHERE connected_account_id = $1 AND amount_cents = $2 LIMIT 1',
            [connectedAccountId, amount],
          );
          if (already.rowCount > 0) {
            this.logger.debug(`Payout already recorded for account ${connectedAccountId} amount ${amount}`);
            // Remove processed entry
            await this.redis.xdel(streamKey, entryId);
            continue;
          }

          // Create a DB record to mark payout intent
          const insert = await pool.query(
            'INSERT INTO stripe_payouts (connected_account_id, workspace_id, amount_cents, currency, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [connectedAccountId, null, amount, currency, 'creating'],
          );
          const localId = insert.rows[0].id;

          try {
            // Create payout on the connected account
            const payout = await this.stripe.payouts.create(
              { amount: amount, currency },
              { stripeAccount: connectedAccountId },
            );

            await pool.query('UPDATE stripe_payouts SET stripe_payout_id = $1, status = $2 WHERE id = $3', [payout.id, payout.status ?? 'created', localId]);
            this.logger.log(`Created payout ${payout.id} for connected account ${connectedAccountId} amount ${amount}`);
          } catch (err) {
            await pool.query('UPDATE stripe_payouts SET status = $1 WHERE id = $2', ['failed', localId]);
            this.logger.error('Failed to create payout via Stripe', err);
          }

          // Remove processed entry
          await this.redis.xdel(streamKey, entryId);
        } catch (err) {
          this.logger.error('Error processing stream entry for payouts', err);
        }
      }
    }
  }
}
