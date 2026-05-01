import { BadRequestException, Controller, Injectable, Logger, Module, OnModuleDestroy, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { AuthModule } from '../auth/auth.module';
import { StripePayoutsService } from './stripe-payouts.service';

interface AuthenticatedRequest extends ExpressRequest {
  user?: { sub?: string; workspaceId?: string };
}

type WorkspaceStripeRow = {
  id: string;
  stripe_connect_account_id: string | null;
};

type CreatePurchaseIntentParams = {
  amountCents: number;
  sellerAccountId: string;
  currency?: string;
};

@Injectable()
export class StripeConnectService implements OnModuleDestroy {
  private readonly logger = new Logger('StripeConnectService');
  private readonly pool: Pool | null;
  private readonly stripe: any;
  private readonly enabled: boolean;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const apiKey = process.env.STRIPE_SECRET_KEY;

    if (!connectionString || !apiKey) {
      this.enabled = false;
      this.pool = null;
      this.stripe = null;
      this.logger.warn(
        'Stripe Connect disabled: set DATABASE_URL and STRIPE_SECRET_KEY to enable market payout features.',
      );
      return;
    }

    this.enabled = true;
    this.pool = new Pool({ connectionString });
    this.stripe = new Stripe(apiKey);
    void this.ensureSchema();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async onboardCreator(workspaceId: string): Promise<{ accountId: string; url: string }> {
    const { pool, stripe } = this.getClients();
    const workspace = await this.getWorkspace(workspaceId);
    let accountId = workspace.stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: process.env.STRIPE_CONNECT_COUNTRY || 'US',
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
      });

      accountId = account.id;

      await pool.query(
        'UPDATE workspaces SET stripe_connect_account_id = $1 WHERE id = $2',
        [accountId, workspaceId],
      );
    }

    const { refreshUrl, returnUrl } = this.getOnboardingUrls();
    if (!accountId) {
      throw new BadRequestException('Unable to resolve Stripe Connect account id');
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return {
      accountId,
      url: accountLink.url,
    };
  }

  async getWorkspaceStripeConnectAccountId(workspaceId: string): Promise<string | null> {
    this.getClients();
    const workspace = await this.getWorkspace(workspaceId);
    return workspace.stripe_connect_account_id;
  }

  async createTemplatePurchaseIntent(params: CreatePurchaseIntentParams) {
    const { stripe } = this.getClients();
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    if (!params.sellerAccountId.trim()) {
      throw new BadRequestException('sellerAccountId is required');
    }

    const feeAmount = Math.max(0, Math.round(params.amountCents * 0.3));
    return stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: (params.currency || 'usd').toLowerCase(),
      transfer_data: {
        destination: params.sellerAccountId,
      },
      application_fee_amount: feeAmount,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async createTemplateCheckoutSession(params: { amountCents: number; sellerAccountId: string; successUrl: string; cancelUrl: string; currency?: string }) {
    const { stripe } = this.getClients();
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    const feeAmount = Math.max(0, Math.round(params.amountCents * 0.3));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: (params.currency || 'usd').toLowerCase(),
            product_data: { name: 'Template purchase' },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeAmount,
        transfer_data: { destination: params.sellerAccountId },
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      automatic_tax: { enabled: false },
    });

    return session;
  }

  private async getWorkspace(workspaceId: string): Promise<WorkspaceStripeRow> {
    const { pool } = this.getClients();
    const result = await pool.query<WorkspaceStripeRow>(
      'SELECT id, stripe_connect_account_id FROM workspaces WHERE id = $1',
      [workspaceId],
    );

    const workspace = result.rows[0];
    if (!workspace) {
      throw new BadRequestException('Workspace not found');
    }

    return workspace;
  }

  private getOnboardingUrls() {
    const dashboardBaseUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
    return {
      refreshUrl: process.env.STRIPE_CONNECT_REFRESH_URL || `${dashboardBaseUrl}/settings`,
      returnUrl: process.env.STRIPE_CONNECT_RETURN_URL || `${dashboardBaseUrl}/settings?tab=billing`,
    };
  }

  private async ensureSchema(): Promise<void> {
    if (!this.pool) {
      return;
    }
    await this.pool.query(`
      ALTER TABLE workspaces
      ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT
    `);
  }

  private getClients(): { pool: Pool; stripe: any } {
    if (!this.enabled || !this.pool || !this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe Connect is not configured on this deployment.',
      );
    }
    return { pool: this.pool, stripe: this.stripe };
  }

  // Expose underlying clients for other services (safe wrapper)
  public getStripeClient(): any {
    return this.getClients().stripe;
  }

  public getDbPool(): Pool {
    return this.getClients().pool;
  }
}

@Controller('market')
export class StripeConnectController {
  constructor(private readonly stripeConnectService: StripeConnectService) {}

  @UseGuards(JwtAuthGuard)
  @Post('onboard-creator')
  async onboardCreator(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId || req.user?.sub;
    if (!workspaceId) {
      throw new BadRequestException('Authenticated workspace id missing');
    }

    const result = await this.stripeConnectService.onboardCreator(workspaceId);
    return { url: result.url };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [StripeConnectController],
  providers: [StripeConnectService, StripePayoutsService],
  exports: [StripeConnectService],
})
export class StripeConnectModule {}