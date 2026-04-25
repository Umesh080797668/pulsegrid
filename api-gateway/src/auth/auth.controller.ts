import { Body, Controller, Get, Post, Query, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

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

class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password, body.name);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: RefreshDto) {
    await this.authService.logout(body.refreshToken);
    return { success: true };
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
  googleCallback(@Query('email') email?: string, @Query('name') name?: string) {
    if (!email) {
      throw new UnauthorizedException('Missing email in callback');
    }
    return this.authService.socialLogin('google', email, name);
  }

  @Get('github/callback')
  githubCallback(@Query('email') email?: string, @Query('name') name?: string) {
    if (!email) {
      throw new UnauthorizedException('Missing email in callback');
    }
    return this.authService.socialLogin('github', email, name);
  }
}
