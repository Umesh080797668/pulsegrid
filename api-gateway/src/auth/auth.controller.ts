import { Body, Controller, Get, Headers, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { EmailService } from '../email/email.service';
import { SendVerificationEmailDto, VerifyEmailDto } from '../dto';
import { Request, Response } from 'express';
import { RateLimitService } from '../rate-limit.service';

class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}



@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Post('register')
  async register(@Body() body: RegisterDto, @Req() req: Request) {
    await this.checkAuthRateLimit(req, 'register', Number(process.env.RATE_LIMIT_REGISTER_PER_MINUTE || 20));
    await this.authService.register(body.email, body.password, body.name);
    const user = await this.authService.getUserByEmail(body.email);
    if (user && !user.emailVerified) {
      const token = await this.authService.generateEmailVerificationToken(user.id);
      await this.emailService.sendVerificationEmail(body.email, token);
    }
    return {
      success: true,
      requiresEmailVerification: true,
      message: 'Account created. Please verify your email before signing in.',
    };
  }

  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.checkAuthRateLimit(req, 'login', Number(process.env.RATE_LIMIT_LOGIN_PER_MINUTE || 30));
    const tokens = await this.authService.login(body.email, body.password);
    res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000 });
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req as any).cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokens = await this.authService.refresh(refreshToken);
    res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000 });
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req as any).cookies?.refresh_token as string | undefined;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie('refresh_token');
    return { success: true };
  }

  @Post('send-verification-email')
  async sendVerificationEmail(@Body() body: SendVerificationEmailDto, @Req() req: Request) {
    await this.checkAuthRateLimit(req, 'send-verification-email', Number(process.env.RATE_LIMIT_VERIFICATION_EMAIL_PER_MINUTE || 5));

    const user = await this.authService.getUserByEmail(body.email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.emailVerified) {
      return { success: true, message: 'Email already verified' };
    }

    const token = await this.authService.generateEmailVerificationToken(user.id);
    const sent = await this.emailService.sendVerificationEmail(body.email, token);

    if (!sent) {
      throw new UnauthorizedException('Failed to send verification email');
    }

    return { success: true, message: 'Verification email sent' };
  }

  @Post('verify-email')
  async verifyEmail(@Body() body: VerifyEmailDto) {
    await this.authService.verifyEmail(body.token);
    return { success: true, message: 'Email verified successfully' };
  }

  @Get('google')
  googleAuthUrl() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new UnauthorizedException('Google OAuth is not configured');
    }

    const scope = encodeURIComponent('openid email profile');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
    return { provider: 'google', authUrl: url };
  }

  @Get('github')
  githubAuthUrl() {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = process.env.GITHUB_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new UnauthorizedException('GitHub OAuth is not configured');
    }

    const scope = encodeURIComponent('read:user user:email');
    const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    return { provider: 'github', authUrl: url };
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code?: string,
    @Query('email') fallbackEmail?: string,
    @Query('name') fallbackName?: string,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (code) {
      const redirectUri = process.env.GOOGLE_REDIRECT_URI;
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!redirectUri || !clientId || !clientSecret) {
        throw new UnauthorizedException('Google OAuth callback is not configured');
      }

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
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

      if (!tokenResp.ok) {
        throw new UnauthorizedException('Google token exchange failed');
      }

      const tokenJson = (await tokenResp.json()) as { access_token?: string };
      const accessToken = tokenJson.access_token;
      if (!accessToken) {
        throw new UnauthorizedException('Google access token missing');
      }

      const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileResp.ok) {
        throw new UnauthorizedException('Failed to fetch Google profile');
      }

      const profile = (await profileResp.json()) as { email?: string; name?: string };
      if (!profile.email) {
        throw new UnauthorizedException('Google account did not return email');
      }

      const tokens = await this.authService.socialLogin('google', profile.email, profile.name);
      res?.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000 });
      return { accessToken: tokens.accessToken };
    }

    if (!fallbackEmail) {
      throw new UnauthorizedException('Missing code or email in callback');
    }

    if (req) {
      await this.checkAuthRateLimit(req, 'google-callback', Number(process.env.RATE_LIMIT_OAUTH_PER_MINUTE || 60));
    }

    const tokens = await this.authService.socialLogin('google', fallbackEmail, fallbackName);
    res?.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000 });
    return { accessToken: tokens.accessToken };
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code?: string,
    @Query('email') fallbackEmail?: string,
    @Query('name') fallbackName?: string,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (code) {
      const redirectUri = process.env.GITHUB_REDIRECT_URI;
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      if (!redirectUri || !clientId || !clientSecret) {
        throw new UnauthorizedException('GitHub OAuth callback is not configured');
      }

      const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': userAgent || 'pulsegrid-auth',
        },
        body: JSON.stringify({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResp.ok) {
        throw new UnauthorizedException('GitHub token exchange failed');
      }

      const tokenJson = (await tokenResp.json()) as { access_token?: string };
      const accessToken = tokenJson.access_token;
      if (!accessToken) {
        throw new UnauthorizedException('GitHub access token missing');
      }

      const userResp = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': userAgent || 'pulsegrid-auth',
        },
      });
      if (!userResp.ok) {
        throw new UnauthorizedException('Failed to fetch GitHub user');
      }

      const user = (await userResp.json()) as { email?: string; name?: string; login?: string };
      let email = user.email;

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
          email = emails.find((entry) => entry.primary && entry.verified)?.email || emails[0]?.email;
        }
      }

      if (!email) {
        throw new UnauthorizedException('GitHub account did not return email');
      }

      const tokens = await this.authService.socialLogin('github', email, user.name || user.login);
      res?.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000 });
      return { accessToken: tokens.accessToken };
    }

    if (!fallbackEmail) {
      throw new UnauthorizedException('Missing code or email in callback');
    }

    if (req) {
      await this.checkAuthRateLimit(req, 'github-callback', Number(process.env.RATE_LIMIT_OAUTH_PER_MINUTE || 60));
    }

    const tokens = await this.authService.socialLogin('github', fallbackEmail, fallbackName);
    res?.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000 });
    return { accessToken: tokens.accessToken };
  }

  private async checkAuthRateLimit(req: Request, keySuffix: string, limit: number): Promise<void> {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]!.trim()
      : req.ip || 'unknown';

    await this.rateLimitService.check(`ratelimit:auth:${keySuffix}:${ip}`, limit, 60);
  }
}
