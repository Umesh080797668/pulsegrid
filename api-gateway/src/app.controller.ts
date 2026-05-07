import { Controller, Get, Inject, OnModuleInit, Post, Body, Param, Headers, Req, RawBodyRequest, UnauthorizedException, BadRequestException, ParseUUIDPipe, UseGuards, InternalServerErrorException, Delete, Put, Query, Res } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { Redis } from 'ioredis';
import { Request, Response as ExpressResponse } from 'express';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import {
  TriggerFlowDto,
  SetSecretDto,
  UpsertWorkspaceCredentialDto,
  CreateWorkspaceDto,
  CreateFlowDto,
  UpdateFlowDto,
  CustomConnectorContractDto,
} from './dto';
import { ManagementApiKeyGuard } from './management-api-key.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RateLimitService } from './rate-limit.service';
import { DEFAULT_CONNECTOR_CATALOG, getCatalogFromUrl, validateCatalogItem } from './connectorCatalog';

interface PulseCoreService {
  triggerFlow(data: { workspaceId: string; flowId: string; payloadJson: string }): Observable<any>;
  setWorkspaceSecret(data: { workspaceId: string; secretName: string; secretValue: string }): Observable<any>;
  verifyWebhookSignature(data: { workspaceId: string; rawPayload: string; providedSignature: string }): Observable<{ isValid: boolean }>;
}

interface WorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner_user_id: string;
  settings: Record<string, unknown>;
  created_at?: string | null;
}

interface ConnectorCatalogItem {
  connector: string;
  action: string;
  category: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  required_input_fields: string[];
  optional_input_fields: string[];
  notes?: string[];
}

interface OAuthProviderConfig {
  provider: 'google' | 'github' | 'notion';
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

interface ConnectorOAuthInstallationRow {
  workspace_id: string;
  connector: string;
  provider: string;
  scope: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Connector catalog sourced from `connectorCatalog.ts` (source of truth)


const OAUTH_CONNECTOR_CONFIGS: Record<string, OAuthProviderConfig> = {
  gmail: {
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
    clientIdEnv: 'GOOGLE_CONNECTOR_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CONNECTOR_CLIENT_SECRET',
  },
  google_sheets: {
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets',
    clientIdEnv: 'GOOGLE_CONNECTOR_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CONNECTOR_CLIENT_SECRET',
  },
  github: {
    provider: 'github',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user repo workflow',
    clientIdEnv: 'GITHUB_CONNECTOR_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CONNECTOR_CLIENT_SECRET',
  },
  notion: {
    provider: 'notion',
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scope: '',
    clientIdEnv: 'NOTION_CONNECTOR_CLIENT_ID',
    clientSecretEnv: 'NOTION_CONNECTOR_CLIENT_SECRET',
  },
};

type OAuthStatePayload = {
  connector: string;
  workspaceId: string;
  userId: string;
  nonce: string;
  ts: number;
};

@Controller()
export class AppController implements OnModuleInit {
  private pulseCoreService!: PulseCoreService;
  private connectorCatalog: ConnectorCatalogItem[] = DEFAULT_CONNECTOR_CATALOG;
  private readonly coreHttpBaseUrl = process.env.CORE_ENGINE_HTTP_URL || 'http://127.0.0.1:8000';
  private readonly oauthPool: Pool | null;

  constructor(
    @Inject('PULSECORE_PACKAGE') private client: ClientGrpc,
    @Inject('REDIS_CLIENT') private redis: Redis,
    private readonly rateLimitService: RateLimitService,
  ) {
    const connectionString = process.env.DATABASE_URL;
    this.oauthPool = connectionString ? new Pool({ connectionString }) : null;
    if (this.oauthPool) {
      void this.ensureConnectorOAuthSchema();
    }
    const catalogUrl = process.env.CONNECTOR_CATALOG_URL;
    if (catalogUrl) {
      void this.refreshCatalogFromUrl(catalogUrl);
    }
  }

  onModuleInit() {
    this.pulseCoreService = this.client.getService<PulseCoreService>('PulseCoreService');
  }

  private async refreshCatalogFromUrl(url: string) {
    try {
      const items = await getCatalogFromUrl(url);
      if (!items) {
        console.warn('Connector catalog: no items fetched from', url);
        return;
      }
      const problems = items.flatMap((it) => validateCatalogItem(it).map((e) => `${it.connector || '<unknown>'}: ${e}`));
      if (problems.length > 0) {
        console.warn('Connector catalog validation failed:', problems.slice(0, 10));
        return;
      }
      this.connectorCatalog = items;
      console.log('Connector catalog updated from', url);
    } catch (err) {
      console.warn('Failed to refresh connector catalog:', err);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('workspaces')
  async createWorkspace(@Body() body: CreateWorkspaceDto, @Req() req: Request) {
    const userId = this.getJwtUserId(req);
    return this.coreRequest('/api/v1/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        slug: body.slug,
        owner_user_id: userId,
        settings: body.settings ?? {},
      }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('workspaces')
  async listWorkspaces(@Req() req: Request) {
    const userId = this.getJwtUserId(req);
    return this.coreRequest(`/api/v1/workspaces?owner_user_id=${encodeURIComponent(userId)}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('workspaces/:workspaceId')
  async getWorkspace(@Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string) {
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('workspaces/:workspaceId/upgrade')
  async upgradeWorkspace(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: { plan: string }
  ) {
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: body.plan }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('workspaces/:workspaceId/billing/subscription')
  async getWorkspaceSubscription(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
  ) {
    const enterpriseServiceUrl = process.env.ENTERPRISE_SERVICE_URL || 'http://127.0.0.1:8080';
    try {
      const response = await fetch(`${enterpriseServiceUrl}/api/v1/enterprise/billing/subscription/${workspaceId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Enterprise service returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch subscription from enterprise service:', error);
      throw new InternalServerErrorException('Enterprise service unavailable');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('workspaces/:workspaceId/api-keys')
  async createApiKey(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: any,
  ) {
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('workspaces/:workspaceId/api-keys')
  async listApiKeys(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
  ) {
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/api-keys`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('workspaces/:workspaceId/api-keys/:keyId')
  async revokeApiKey(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('keyId', new ParseUUIDPipe({ version: '4' })) keyId: string,
  ) {
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/api-keys/${keyId}`, {
      method: 'DELETE',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('credentials/:credentialId/dependents')
  async getCredentialDependents(
    @Param('credentialId', new ParseUUIDPipe({ version: '4' })) credentialId: string,
  ) {
    return this.coreRequest(`/api/v1/credentials/${credentialId}/dependents`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('trigger')
  async triggerFlow(@Body() body: TriggerFlowDto, @Req() req: Request) {
    await this.rateLimitService.check(
      `ratelimit:trigger:${this.getClientIdentifier(req)}`,
      Number(process.env.RATE_LIMIT_TRIGGER_PER_MINUTE || 120),
      60,
    );

    console.log('Sending trigger request to Core Engine over gRPC...', body);
    return this.pulseCoreService.triggerFlow({
      workspaceId: body.workspaceId,
      flowId: body.flowId,
      payloadJson: JSON.stringify(body.payload),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows')
  async createFlow(@Body() body: CreateFlowDto, @Req() req: Request) {
    const actorId = this.getJwtUserId(req);
    return this.coreRequest('/api/v1/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: body.workspaceId,
        name: body.name,
        description: body.description ?? null,
        definition: body.definition,
        created_by: actorId,
      }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flows')
  async listFlows(
    @Query('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
  ) {
    return this.coreRequest(`/api/v1/flows/${workspaceId}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flows/:flowId')
  async getFlow(@Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string) {
    return this.coreRequest(`/api/v1/flow/${flowId}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put('flows/:flowId')
  async updateFlow(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Body() body: UpdateFlowDto,
    @Req() req: Request,
  ) {
    const actorId = this.getJwtUserId(req);
    return this.coreRequest(`/api/v1/flow/${flowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        description: body.description,
        definition: body.definition,
        enabled: body.enabled,
        created_by: actorId,
        note: body.note,
      }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flows/:flowId/runs')
  async getFlowRuns(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Query('environment') environment?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const qp = new URLSearchParams();
    if (environment) qp.set('environment', environment);
    if (limit) qp.set('limit', limit);
    if (offset) qp.set('offset', offset);
    const suffix = qp.toString() ? `?${qp.toString()}` : '';

    return this.coreRequest(`/api/v1/flows/${flowId}/runs${suffix}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flows/:flowId/versions')
  async listFlowVersions(@Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string) {
    return this.coreRequest(`/api/v1/flows/${flowId}/versions`, { method: 'GET' });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flows/:flowId/versions/:versionId/diff')
  async getFlowVersionDiff(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string,
    @Query('targetVersionId') targetVersionId?: string,
  ) {
    const suffix = targetVersionId ? `?target_version_id=${encodeURIComponent(targetVersionId)}` : '';
    return this.coreRequest(`/api/v1/flows/${flowId}/versions/${versionId}/diff${suffix}`, { method: 'GET' });
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows/:flowId/rollback/:versionId')
  async rollbackFlowVersion(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string,
    @Req() req: Request,
    @Body() body: { note?: string },
  ) {
    const actorId = this.getJwtUserId(req);
    return this.coreRequest(`/api/v1/flows/${flowId}/rollback/${versionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ created_by: actorId, note: body?.note }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flows/:flowId/environments')
  async getFlowEnvironments(@Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string) {
    return this.coreRequest(`/api/v1/flows/${flowId}/environments`, { method: 'GET' });
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows/:flowId/deploy/staging')
  async deployFlowToStaging(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Req() req: Request,
    @Body() body: { note?: string },
  ) {
    const actorId = this.getJwtUserId(req);
    return this.coreRequest(`/api/v1/flows/${flowId}/deploy/staging`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ created_by: actorId, note: body?.note }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows/:flowId/promote')
  async promoteFlowToProduction(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Req() req: Request,
    @Body() body: { note?: string },
  ) {
    const actorId = this.getJwtUserId(req);
    return this.coreRequest(`/api/v1/flows/${flowId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ created_by: actorId, note: body?.note }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows/:flowId/run/:environment')
  async runFlowInEnvironment(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Param('environment') environment: string,
    @Body() body: { input?: Record<string, unknown> },
  ) {
    return this.coreRequest(`/api/v1/flows/${flowId}/run/${encodeURIComponent(environment)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: body?.input || {} }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('flows/:flowId')
  async deleteFlow(@Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string) {
    return this.coreRequest(`/api/v1/flow/${flowId}`, {
      method: 'DELETE',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('connectors/custom/schema')
  getCustomConnectorSchema() {
    const custom = this.connectorCatalog.find((item) => item.connector === 'custom');
    const supportedAliases = this.connectorCatalog
      .filter((item) => item.connector !== 'custom')
      .map((item) => item.connector);

    return {
      connector: 'custom',
      action: 'call_api',
      required_input_fields: ['endpoint_url'],
      optional_input_fields: [
        'method',
        'body',
        'headers',
        'bearer_token',
        'api_key_header',
        'api_key_value',
      ],
      contract_example: {
        endpoint_url: 'https://api.example.com/v1/items',
        method: 'POST',
        body: { name: 'PulseGrid' },
        headers: { 'X-App-Source': 'pulsegrid' },
      } satisfies CustomConnectorContractDto,
      notes: [
        'Use connector=custom or connector=custom_app in flow steps.',
        'For bearer auth, set bearer_token.',
        'For API-key auth, set both api_key_header and api_key_value.',
        ...(custom?.notes ?? []),
      ],
      supported_connector_aliases: supportedAliases,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('connectors/catalog')
  getConnectorCatalog() {
    return {
      count: this.connectorCatalog.length,
      generatedAt: new Date().toISOString(),
      items: this.connectorCatalog,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('connectors/oauth/:connector/start')
  async startConnectorOAuth(
    @Param('connector') connector: string,
    @Query('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Req() req: Request,
  ) {
    const config = this.getOAuthConfig(connector);
    if (!config) {
      throw new BadRequestException(`Connector ${connector} does not support OAuth installation`);
    }

    const clientId = process.env[config.clientIdEnv] || '';
    if (!clientId) {
      throw new BadRequestException(`Missing OAuth client ID for ${connector}`);
    }

    const userId = this.getJwtUserId(req);
    await this.assertWorkspaceOwnership(userId, workspaceId);

    const redirectUri = this.getConnectorOAuthCallbackUrl(connector);
    const statePayload: OAuthStatePayload = {
      connector,
      workspaceId,
      userId,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
    };
    const state = this.signOAuthState(statePayload);

    const authorizeUrl = new URL(config.authorizeUrl);
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('state', state);
    if (config.scope) {
      authorizeUrl.searchParams.set('scope', config.scope);
    }
    if (config.provider === 'notion') {
      authorizeUrl.searchParams.set('owner', 'user');
    }

    return {
      connector,
      provider: config.provider,
      workspaceId,
      authorizeUrl: authorizeUrl.toString(),
      callbackUrl: redirectUri,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('connectors/oauth/installations')
  async listConnectorOAuthInstallations(
    @Query('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Req() req: Request,
  ) {
    if (!this.oauthPool) {
      return { items: [] };
    }

    const userId = this.getJwtUserId(req);
    await this.assertWorkspaceOwnership(userId, workspaceId);

    const result = await this.oauthPool.query<ConnectorOAuthInstallationRow>(
      `SELECT workspace_id, connector, provider, scope, expires_at, created_at, updated_at
       FROM connector_oauth_installations
       WHERE workspace_id = $1
       ORDER BY updated_at DESC`,
      [workspaceId],
    );

    return {
      items: result.rows.map((row) => ({
        workspaceId: row.workspace_id,
        connector: row.connector,
        provider: row.provider,
        scope: row.scope,
        expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
        connectedAt: row.updated_at.toISOString(),
      })),
    };
  }

  @Get('connectors/oauth/:connector/callback')
  async handleConnectorOAuthCallback(
    @Param('connector') connector: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Res() res: ExpressResponse,
  ) {
    const config = this.getOAuthConfig(connector);
    if (!config) {
      return res.redirect(this.buildDashboardOAuthCallbackUrl({
        status: 'error',
        connector,
        workspaceId: '',
        message: 'Unsupported connector',
      }));
    }

    if (oauthError) {
      return res.redirect(this.buildDashboardOAuthCallbackUrl({
        status: 'error',
        connector,
        workspaceId: '',
        message: oauthError,
      }));
    }

    if (!code || !state) {
      return res.redirect(this.buildDashboardOAuthCallbackUrl({
        status: 'error',
        connector,
        workspaceId: '',
        message: 'Missing code or state',
      }));
    }

    let payload: OAuthStatePayload;
    try {
      payload = this.verifyOAuthState(state);
    } catch {
      return res.redirect(this.buildDashboardOAuthCallbackUrl({
        status: 'error',
        connector,
        workspaceId: '',
        message: 'Invalid OAuth state',
      }));
    }

    if (payload.connector !== connector) {
      return res.redirect(this.buildDashboardOAuthCallbackUrl({
        status: 'error',
        connector,
        workspaceId: payload.workspaceId,
        message: 'Connector mismatch',
      }));
    }

    if (!this.oauthPool) {
      return res.redirect(this.buildDashboardOAuthCallbackUrl({
        status: 'error',
        connector,
        workspaceId: payload.workspaceId,
        message: 'OAuth storage is unavailable',
      }));
    }

    try {
      const tokenData = await this.exchangeConnectorOAuthCode(connector, code);
      await this.oauthPool.query(
        `INSERT INTO connector_oauth_installations (
          workspace_id,
          connector,
          provider,
          access_token,
          refresh_token,
          token_type,
          scope,
          expires_at,
          metadata,
          created_by_user_id,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW())
        ON CONFLICT (workspace_id, connector)
        DO UPDATE SET
          provider = EXCLUDED.provider,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          token_type = EXCLUDED.token_type,
          scope = EXCLUDED.scope,
          expires_at = EXCLUDED.expires_at,
          metadata = EXCLUDED.metadata,
          created_by_user_id = EXCLUDED.created_by_user_id,
          updated_at = NOW()`,
        [
          payload.workspaceId,
          connector,
          config.provider,
          tokenData.accessToken,
          tokenData.refreshToken,
          tokenData.tokenType,
          tokenData.scope,
          tokenData.expiresAt,
          JSON.stringify({ raw: tokenData.raw }),
          payload.userId,
        ],
      );

      return res.redirect(this.buildDashboardOAuthCallbackUrl({
        status: 'success',
        connector,
        workspaceId: payload.workspaceId,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth token exchange failed';
      return res.redirect(this.buildDashboardOAuthCallbackUrl({
        status: 'error',
        connector,
        workspaceId: payload.workspaceId,
        message,
      }));
    }
  }

  @UseGuards(JwtAuthGuard, ManagementApiKeyGuard)
  @Post('workspaces/:workspaceId/secrets')
  async setSecret(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: SetSecretDto,
    @Req() req: Request,
  ) {
    await this.rateLimitService.check(
      `ratelimit:secret-upsert:${this.getClientIdentifier(req)}`,
      Number(process.env.RATE_LIMIT_SECRET_WRITES_PER_MINUTE || 30),
      60,
    );

    if (!body?.value) {
      throw new BadRequestException('Missing secret value');
    }

    const secretName = (body?.name?.trim() || 'WEBHOOK_SECRET').toUpperCase();
    console.log(`Setting secret ${secretName} for workspace ${workspaceId}...`);
    return this.pulseCoreService.setWorkspaceSecret({
      workspaceId,
      secretName,
      secretValue: body.value,
    });
  }

  @UseGuards(JwtAuthGuard, ManagementApiKeyGuard)
  @Post('workspaces/:workspaceId/credentials')
  async upsertWorkspaceCredential(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: UpsertWorkspaceCredentialDto,
    @Req() req: Request,
  ) {
    await this.rateLimitService.check(
      `ratelimit:credential-upsert:${this.getClientIdentifier(req)}`,
      Number(process.env.RATE_LIMIT_SECRET_WRITES_PER_MINUTE || 30),
      60,
    );

    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        value: body.value,
      }),
    });
  }

  @UseGuards(JwtAuthGuard, ManagementApiKeyGuard)
  @Get('workspaces/:workspaceId/credentials')
  async listWorkspaceCredentials(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
  ) {
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/secrets`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard, ManagementApiKeyGuard)
  @Delete('workspaces/:workspaceId/credentials/:name')
  async deleteWorkspaceCredential(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('name') name: string,
  ) {
    const encodedName = encodeURIComponent(name);
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/secrets/${encodedName}`, {
      method: 'DELETE',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flow-runs')
  async listFlowRuns(
    @Query('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Query('environment') environment?: string,
  ) {
    const suffix = environment ? `?environment=${encodeURIComponent(environment)}` : '';
    return this.coreRequest(`/api/v1/flow-runs/${workspaceId}${suffix}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flow-runs/:runId')
  async getFlowRun(@Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string) {
    return this.coreRequest(`/api/v1/flow-run/${runId}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows/:flowId/runs/:runId/steps/:stepId/replay')
  async replayFlowRunStep(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Param('stepId') stepId: string,
  ) {
    const encodedStepId = encodeURIComponent(stepId);
    return this.coreRequest(`/api/v1/flows/${flowId}/runs/${runId}/steps/${encodedStepId}/replay`, {
      method: 'POST',
    });
  }

  @Post('webhook/:tenantId')
  async handleWebhook(
    @Param('tenantId', new ParseUUIDPipe({ version: '4' })) tenantId: string,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') webhookTimestamp: string,
    @Headers('x-webhook-nonce') webhookNonce: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    await this.rateLimitService.check(
      `ratelimit:webhook:${tenantId}:${webhookNonce.slice(0, 8)}`,
      Number(process.env.RATE_LIMIT_WEBHOOK_PER_MINUTE || 300),
      60,
    );

    if (!signature) {
      throw new UnauthorizedException('Missing x-webhook-signature header');
    }

    if (!webhookTimestamp || !/^\d+$/.test(webhookTimestamp)) {
      throw new UnauthorizedException('Missing or invalid x-webhook-timestamp header');
    }

    if (!webhookNonce || webhookNonce.length < 16) {
      throw new UnauthorizedException('Missing or invalid x-webhook-nonce header');
    }

    const allowedSkewSeconds = Number.parseInt(process.env.WEBHOOK_MAX_SKEW_SECONDS || '300', 10);
    const timestampSeconds = Number.parseInt(webhookTimestamp, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > allowedSkewSeconds) {
      throw new UnauthorizedException('Webhook request expired or not yet valid');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw request body is missing');
    }

    // Call Core Engine to securely validate the HMAC
    const validationResponse = await firstValueFrom(
      this.pulseCoreService.verifyWebhookSignature({
        workspaceId: tenantId,
        rawPayload: rawBody.toString('utf8'),
        providedSignature: signature
      })
    );

    if (!validationResponse.isValid) {
      throw new UnauthorizedException('Invalid Webhook Signature');
    }

    const nonceKey = `webhook:nonce:${tenantId}:${webhookNonce}`;
    const nonceTtlSeconds = Math.max(allowedSkewSeconds * 2, 600);
    const nonceSetResult = await this.redis.set(nonceKey, '1', 'EX', nonceTtlSeconds, 'NX');
    if (nonceSetResult !== 'OK') {
      throw new UnauthorizedException('Replay detected');
    }

    // Process the webhook safely
    const payload = req.body;
    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const normalizedEvent = {
      id: eventId,
      tenant_id: tenantId,
      source: req.headers['user-agent'] ?? null,
      event_type: 'webhook',
      data: payload,
      timestamp,
      schema_version: '1.0',
      security: {
        webhook_timestamp: webhookTimestamp,
        webhook_nonce: webhookNonce,
      },
    };

    try {
      const streamKey = `stream:events:${tenantId}`;
      await this.redis.xadd(
        streamKey,
        '*',
        'payload', JSON.stringify(normalizedEvent)
      );
    } catch {
      throw new InternalServerErrorException('Failed to publish event');
    }

    console.log(`Webhook published to Redis for tenant ${tenantId}`);
    return { status: 'success', tenantId, eventId };
  }

  @Get('health')
  async health() {
    const enterpriseServiceUrl = process.env.ENTERPRISE_SERVICE_URL || 'http://127.0.0.1:8080';
    let enterpriseStatus = 'unknown';

    try {
      const response = await fetch(`${enterpriseServiceUrl}/api/v1/enterprise/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      enterpriseStatus = response.ok ? 'UP' : 'DOWN';
    } catch (error) {
      enterpriseStatus = 'UNREACHABLE';
    }

    return {
      status: 'API Gateway OK',
      services: {
        gateway: 'UP',
        enterprise: enterpriseStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private getOAuthConfig(connector: string): OAuthProviderConfig | null {
    return OAUTH_CONNECTOR_CONFIGS[connector] ?? null;
  }

  private getConnectorOAuthCallbackUrl(connector: string): string {
    const base = process.env.API_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000';
    return `${base.replace(/\/$/, '')}/connectors/oauth/${encodeURIComponent(connector)}/callback`;
  }

  private buildDashboardOAuthCallbackUrl(params: {
    status: 'success' | 'error';
    connector: string;
    workspaceId: string;
    message?: string;
  }): string {
    const dashboardBase = process.env.DASHBOARD_PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
    const url = new URL(`${dashboardBase.replace(/\/$/, '')}/oauth/callback`);
    url.searchParams.set('status', params.status);
    url.searchParams.set('connector', params.connector);
    if (params.workspaceId) {
      url.searchParams.set('workspaceId', params.workspaceId);
    }
    if (params.message) {
      url.searchParams.set('message', params.message);
    }
    return url.toString();
  }

  private signOAuthState(payload: OAuthStatePayload): string {
    const secret = process.env.CONNECTOR_OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'pulsegrid-dev-oauth-state';
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  private verifyOAuthState(state: string): OAuthStatePayload {
    const secret = process.env.CONNECTOR_OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'pulsegrid-dev-oauth-state';
    const [encodedPayload, providedSignature] = state.split('.');
    if (!encodedPayload || !providedSignature) {
      throw new BadRequestException('Invalid OAuth state format');
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    if (expectedSignature !== providedSignature) {
      throw new UnauthorizedException('Invalid OAuth state signature');
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as OAuthStatePayload;
    const maxAgeMs = Number(process.env.CONNECTOR_OAUTH_STATE_MAX_AGE_MS || 10 * 60 * 1000);
    if (Date.now() - payload.ts > maxAgeMs) {
      throw new UnauthorizedException('Expired OAuth state');
    }

    return payload;
  }

  private async exchangeConnectorOAuthCode(connector: string, code: string): Promise<{
    accessToken: string;
    refreshToken: string | null;
    tokenType: string | null;
    scope: string | null;
    expiresAt: Date | null;
    raw: unknown;
  }> {
    const config = this.getOAuthConfig(connector);
    if (!config) {
      throw new BadRequestException(`Unsupported OAuth connector: ${connector}`);
    }

    const clientId = process.env[config.clientIdEnv] || '';
    const clientSecret = process.env[config.clientSecretEnv] || '';
    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(`Missing OAuth credentials for connector ${connector}`);
    }

    const redirectUri = this.getConnectorOAuthCallbackUrl(connector);
    let response: globalThis.Response;

    if (config.provider === 'google') {
      response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
      });
    } else if (config.provider === 'github') {
      response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
      });
    } else {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basic}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException(`OAuth token exchange failed for ${connector}`);
    }

    const parsed = payload as {
      access_token?: string;
      refresh_token?: string;
      token_type?: string;
      scope?: string;
      expires_in?: number;
    };

    if (!parsed.access_token) {
      throw new BadRequestException(`OAuth provider did not return access token for ${connector}`);
    }

    const expiresAt = parsed.expires_in ? new Date(Date.now() + parsed.expires_in * 1000) : null;
    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token ?? null,
      tokenType: parsed.token_type ?? null,
      scope: parsed.scope ?? null,
      expiresAt,
      raw: payload,
    };
  }

  private async ensureConnectorOAuthSchema(): Promise<void> {
    if (!this.oauthPool) {
      return;
    }

    await this.oauthPool.query(`
      CREATE TABLE IF NOT EXISTS connector_oauth_installations (
        workspace_id UUID NOT NULL,
        connector VARCHAR(128) NOT NULL,
        provider VARCHAR(64) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_type VARCHAR(64),
        scope TEXT,
        expires_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (workspace_id, connector)
      );

      CREATE INDEX IF NOT EXISTS idx_connector_oauth_installations_workspace_updated
      ON connector_oauth_installations(workspace_id, updated_at DESC);
    `);
  }

  private async assertWorkspaceOwnership(userId: string, workspaceId: string): Promise<void> {
    const workspace = await this.coreRequest(`/api/v1/workspaces/${workspaceId}`, {
      method: 'GET',
    }) as WorkspaceResponse;

    if (!workspace || workspace.owner_user_id !== userId) {
      throw new UnauthorizedException('You do not have access to this workspace');
    }
  }

  private async coreRequest(path: string, options: RequestInit) {
    let response: Response;
    try {
      response = await fetch(`${this.coreHttpBaseUrl}${path}`, options);
    } catch {
      throw new InternalServerErrorException('Core engine is unreachable');
    }

    const text = await response.text();
    const maybeJson = text ? (() => {
      try { return JSON.parse(text); } catch { return text; }
    })() : null;

    if (!response.ok) {
      if (response.status === 400) throw new BadRequestException(maybeJson || 'Invalid request');
      if (response.status === 401) throw new UnauthorizedException(maybeJson || 'Unauthorized');
      throw new InternalServerErrorException(typeof maybeJson === 'string' ? maybeJson : 'Core request failed');
    }

    return maybeJson;
  }

  private getClientIdentifier(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      return forwardedFor.split(',')[0]!.trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0]!.split(',')[0]!.trim();
    }

    return req.ip || 'unknown';
  }

  private getJwtUserId(req: Request): string {
    const user = (req as Request & { user?: { sub?: string } }).user;
    if (!user?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return user.sub;
  }
}
