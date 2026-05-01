/// Microsoft OAuth2 Strategy Implementation
/// Handles login via Microsoft Entra ID (Azure AD) and personal Microsoft accounts
/// Supports both authorization code flow (web apps) and direct token validation (mobile)

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { createPublicKey, createVerify, KeyObject } from 'crypto';
import { AuthService } from './auth.service';

export interface MicrosoftTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface MicrosoftUserInfo {
  email: string;
  name?: string;
  oid: string;
}

interface OpenIdConfiguration {
  issuer: string;
  jwks_uri: string;
}

interface JwkKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

@Injectable()
export class MicrosoftOAuthStrategy {
  private readonly logger = new Logger('MicrosoftOAuthStrategy');
  private readonly configCache = new Map<string, { value: OpenIdConfiguration; expiresAt: number }>();
  private readonly jwksCache = new Map<string, { value: JwksResponse; expiresAt: number }>();
  private readonly cacheTtlMs = 10 * 60 * 1000;

  constructor(private readonly authService: AuthService) {}

  /**
   * Exchange authorization code for tokens
   * Called after user authorizes the app on Microsoft login page
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<MicrosoftTokenResponse> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    if (!clientId || !clientSecret) {
      throw new Error('Microsoft OAuth credentials not configured');
    }

    try {
      const response = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            scope: 'openid email profile',
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`Token exchange failed: ${errorData}`);
        throw new UnauthorizedException('Microsoft token exchange failed');
      }

      return response.json();
    } catch (error) {
      this.logger.error('Code exchange error:', error);
      throw new UnauthorizedException('Failed to exchange authorization code');
    }
  }

  /**
   * Validate and decode Microsoft ID token
   * Verifies JWT signature and critical claims via Microsoft OpenID discovery/JWKS.
   */
  async validateIdToken(idToken: string): Promise<MicrosoftUserInfo> {
    try {
      const decoded = await this.verifyAndDecodeIdToken(idToken);

      // Validate required Microsoft claims
      if (!decoded.oid) {
        throw new Error('Missing oid (Object ID) in token');
      }

      const email = decoded.email || decoded.preferred_username;
      if (!email) {
        throw new Error('Missing email in Microsoft token');
      }

      return {
        email,
        name: decoded.name || decoded.given_name,
        oid: decoded.oid,
      };
    } catch (error) {
      this.logger.error('ID token validation failed:', error);
      throw new UnauthorizedException('Invalid Microsoft ID token');
    }
  }

  /**
   * Get Microsoft authorization URL
   * User is redirected to this URL to authenticate and consent
   */
  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    if (!clientId) {
      throw new Error('MICROSOFT_CLIENT_ID not configured');
    }

    const scope = encodeURIComponent('openid email profile');
    const url = new URL(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    );

    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scope);
    url.searchParams.set('response_mode', 'query');

    if (state) {
      url.searchParams.set('state', state);
    }

    return url.toString();
  }

  /**
   * Refresh an expired access token using refresh token
   * Called when access token expires but user still has valid refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    if (!clientId || !clientSecret) {
      throw new Error('Microsoft OAuth credentials not configured');
    }

    try {
      const response = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: 'openid email profile',
          }),
        },
      );

      if (!response.ok) {
        throw new UnauthorizedException('Failed to refresh Microsoft token');
      }

      return response.json();
    } catch (error) {
      this.logger.error('Token refresh error:', error);
      throw new UnauthorizedException('Microsoft token refresh failed');
    }
  }

  /**
   * Logout: revoke the refresh token
   * Ensures token is no longer valid after logout
   */
  async revokeToken(token: string): Promise<void> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    if (!clientId) {
      return; // Silently fail if not configured
    }

    try {
      await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          token,
        }),
      });
    } catch (error) {
      this.logger.warn('Token revocation failed:', error);
      // Don't throw — logout should succeed even if revocation fails
    }
  }

  private async verifyAndDecodeIdToken(token: string): Promise<Record<string, any>> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      throw new UnauthorizedException('MICROSOFT_CLIENT_ID not configured');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid JWT format');
    }

    const header = this.decodeJwtPart(parts[0]);
    const payload = this.decodeJwtPart(parts[1]);

    const kid = header?.kid;
    const alg = header?.alg;
    if (!kid || alg !== 'RS256') {
      throw new UnauthorizedException('Unsupported JWT header');
    }

    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    const openId = await this.getOpenIdConfiguration(tenantId);
    const jwks = await this.getJwks(openId.jwks_uri);
    const jwk = jwks.keys.find((key) => key.kid === kid && key.kty === 'RSA');

    if (!jwk) {
      throw new UnauthorizedException('Signing key not found');
    }

    if (!this.verifyJwtSignature(token, jwk)) {
      throw new UnauthorizedException('Invalid JWT signature');
    }

    this.validateTokenClaims(payload, openId.issuer, clientId, tenantId);
    return payload;
  }

  private validateTokenClaims(
    payload: Record<string, any>,
    expectedIssuer: string,
    clientId: string,
    tenantId: string,
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const exp = Number(payload.exp ?? 0);
    const nbf = Number(payload.nbf ?? 0);

    if (!exp || exp <= now) {
      throw new UnauthorizedException('Microsoft token is expired');
    }

    if (nbf && nbf > now + 60) {
      throw new UnauthorizedException('Microsoft token not yet valid');
    }

    const aud = payload.aud;
    const validAudience = Array.isArray(aud)
      ? aud.includes(clientId)
      : typeof aud === 'string' && aud === clientId;
    if (!validAudience) {
      throw new UnauthorizedException('Microsoft token audience mismatch');
    }

    const issuer = String(payload.iss ?? '');
    if (tenantId === 'common') {
      if (!issuer.startsWith('https://login.microsoftonline.com/')) {
        throw new UnauthorizedException('Invalid Microsoft token issuer');
      }
    } else if (issuer !== expectedIssuer) {
      throw new UnauthorizedException('Microsoft token issuer mismatch');
    }
  }

  private verifyJwtSignature(token: string, jwk: JwkKey): boolean {
    const parts = token.split('.');
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = this.base64UrlToBuffer(parts[2]);
    const key = this.jwkToPublicKey(jwk);

    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    return verifier.verify(key, signature);
  }

  private jwkToPublicKey(jwk: JwkKey): KeyObject {
    if (!jwk.n || !jwk.e) {
      throw new UnauthorizedException('Invalid JWK');
    }

    return createPublicKey({
      key: {
        kty: 'RSA',
        n: jwk.n,
        e: jwk.e,
      },
      format: 'jwk',
    } as any);
  }

  private decodeJwtPart(part: string): Record<string, any> {
    try {
      const decoded = this.base64UrlToBuffer(part).toString('utf-8');
      return JSON.parse(decoded) as Record<string, any>;
    } catch (error) {
      throw new Error('Failed to decode JWT');
    }
  }

  private base64UrlToBuffer(value: string): Buffer {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64');
  }

  private async getOpenIdConfiguration(tenantId: string): Promise<OpenIdConfiguration> {
    const cacheKey = `openid:${tenantId}`;
    const cached = this.configCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
    );
    if (!response.ok) {
      throw new UnauthorizedException('Failed to load Microsoft OpenID configuration');
    }

    const config = (await response.json()) as OpenIdConfiguration;
    this.configCache.set(cacheKey, {
      value: config,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return config;
  }

  private async getJwks(jwksUri: string): Promise<JwksResponse> {
    const cacheKey = `jwks:${jwksUri}`;
    const cached = this.jwksCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const response = await fetch(jwksUri);
    if (!response.ok) {
      throw new UnauthorizedException('Failed to load Microsoft signing keys');
    }

    const jwks = (await response.json()) as JwksResponse;
    this.jwksCache.set(cacheKey, {
      value: jwks,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return jwks;
  }
}
