/// Microsoft OAuth2 Strategy Implementation
/// Handles login via Microsoft Entra ID (Azure AD) and personal Microsoft accounts
/// Supports both authorization code flow (web apps) and direct token validation (mobile)

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
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

@Injectable()
export class MicrosoftOAuthStrategy {
  private readonly logger = new Logger('MicrosoftOAuthStrategy');

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
   * Extracts user claims without network call (for performance)
   * In production, also verify signature against Microsoft's public keys
   */
  async validateIdToken(idToken: string): Promise<MicrosoftUserInfo> {
    try {
      const decoded = this.decodeJwt(idToken);

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

  /**
   * Decode JWT without signature verification
   * Use only for extracting claims; always verify signature in production!
   */
  private decodeJwt(token: string): Record<string, any> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const decoded = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error('Failed to decode JWT');
    }
  }
}
