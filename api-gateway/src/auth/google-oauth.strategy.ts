import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';

export interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
}

export interface GoogleUserInfo {
  email: string;
  name?: string;
  picture?: string;
  sub?: string;
}

@Injectable()
export class GoogleOAuthStrategy {
  private readonly logger = new Logger('GoogleOAuthStrategy');

  constructor() {}

  getAuthorizationUrl(redirectUri: string, state?: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
    const scope = encodeURIComponent('openid email profile');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scope);
    if (state) url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      this.logger.error('Google token exchange failed: ' + txt);
      throw new UnauthorizedException('Google token exchange failed');
    }

    return resp.json();
  }

  async getUserInfoFromAccessToken(accessToken: string): Promise<GoogleUserInfo> {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      throw new UnauthorizedException('Failed to fetch Google profile');
    }
    const profile = await resp.json();
    if (!profile.email) throw new UnauthorizedException('Google account did not return email');
    return { email: profile.email, name: profile.name, picture: profile.picture, sub: profile.id || profile.sub };
  }

  async validateIdToken(idToken: string): Promise<GoogleUserInfo> {
    // Lightweight validation: decode payload and check audience. For full validation use Google's ID token verification.
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT');
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      const aud = payload.aud;
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId || aud !== clientId) {
        throw new Error('ID token audience mismatch');
      }
      const email = payload.email || payload.preferred_username;
      if (!email) throw new Error('Missing email in id token');
      return { email, name: payload.name, picture: payload.picture, sub: payload.sub };
    } catch (err) {
      this.logger.error('Google id token validation failed', err);
      throw new UnauthorizedException('Invalid Google ID token');
    }
  }
}
