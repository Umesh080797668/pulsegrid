import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';

export interface GithubTokenResponse {
  access_token?: string;
  scope?: string;
  token_type?: string;
}

export interface GithubUserInfo {
  email: string;
  name?: string;
  login?: string;
  id?: number | string;
}

@Injectable()
export class GithubOAuthStrategy {
  private readonly logger = new Logger('GithubOAuthStrategy');

  constructor() {}

  getAuthorizationUrl(redirectUri: string, state?: string) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) throw new Error('GITHUB_CLIENT_ID not configured');
    const scope = encodeURIComponent('read:user user:email');
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scope);
    if (state) url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCodeForToken(code: string, redirectUri: string, userAgent?: string): Promise<GithubTokenResponse> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('GitHub OAuth credentials not configured');

    const resp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': userAgent || 'pulsegrid-auth',
      },
      body: JSON.stringify({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      this.logger.error('GitHub token exchange failed: ' + txt);
      throw new UnauthorizedException('GitHub token exchange failed');
    }

    return resp.json();
  }

  async getUserInfoFromAccessToken(accessToken: string, userAgent?: string): Promise<GithubUserInfo> {
    const resp = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': userAgent || 'pulsegrid-auth',
      },
    });
    if (!resp.ok) throw new UnauthorizedException('Failed to fetch GitHub user');
    const user = await resp.json();

    let email: string | undefined = user.email;
    if (!email) {
      const emailsResp = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': userAgent || 'pulsegrid-auth',
        },
      });
      if (emailsResp.ok) {
        const emails = (await emailsResp.json()) as Array<{ email: string; primary?: boolean; verified?: boolean }>;
        email = emails.find((e) => e.primary && e.verified)?.email || emails[0]?.email;
      }
    }

    if (!email) throw new UnauthorizedException('GitHub account did not return email');

    return { email, name: user.name, login: user.login, id: user.id };
  }
}
