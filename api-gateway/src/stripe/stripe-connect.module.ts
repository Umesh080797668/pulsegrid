import { BadRequestException, Controller, Injectable, Module, OnModuleDestroy, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { AuthModule } from '../auth/auth.module';

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
  private readonly pool: Pool;
  private readonly stripe: any;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set for Stripe Connect persistence');
    }

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY must be set for Stripe Connect');
    }

    this.pool = new Pool({ connectionString });
    this.stripe = new Stripe(apiKey);
    void this.ensureSchema();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async onboardCreator(workspaceId: string): Promise<{ accountId: string; url: string }> {
    const workspace = await this.getWorkspace(workspaceId);
    let accountId = workspace.stripe_connect_account_id;

    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: process.env.STRIPE_CONNECT_COUNTRY || 'US',
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
      });

      accountId = account.id;

      await this.pool.query(
        'UPDATE workspaces SET stripe_connect_account_id = $1 WHERE id = $2',
        [accountId, workspaceId],
      );
    }

    const { refreshUrl, returnUrl } = this.getOnboardingUrls();
    if (!accountId) {
      throw new BadRequestException('Unable to resolve Stripe Connect account id');
    }

    const accountLink = await this.stripe.accountLinks.create({
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
    const workspace = await this.getWorkspace(workspaceId);
    return workspace.stripe_connect_account_id;
  }

  async createTemplatePurchaseIntent(params: CreatePurchaseIntentParams) {
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    if (!params.sellerAccountId.trim()) {
      throw new BadRequestException('sellerAccountId is required');
    }

    const feeAmount = Math.max(0, Math.round(params.amountCents * 0.3));
    return this.stripe.paymentIntents.create({
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

  private async getWorkspace(workspaceId: string): Promise<WorkspaceStripeRow> {
    const result = await this.pool.query<WorkspaceStripeRow>(
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
    await this.pool.query(`
      ALTER TABLE workspaces
      ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT
    `);
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
  providers: [StripeConnectService],
  exports: [StripeConnectService],
})
export class StripeConnectModule {}