import { Body, Controller, Post, Req, Res, UseGuards, UnauthorizedException } from '@nestjs/common';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MfaService } from './mfa.service';
import { Response } from 'express';

class MfaVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  token!: string;
}

class MfaChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  token!: string;

  @IsString()
  @IsNotEmpty()
  mfaToken!: string;
}

@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('setup')
  @UseGuards(JwtAuthGuard)
  async setup(@Req() req: Request) {
    const user = (req as Request & { user?: { sub?: string } }).user;
    if (!user?.sub) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.mfaService.setup(user.sub);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  async verify(@Req() req: Request, @Body() body: MfaVerifyDto) {
    const user = (req as Request & { user?: { sub?: string } }).user;
    if (!user?.sub) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.mfaService.verify(user.sub, body.token);
  }

  @Post('challenge')
  async challenge(@Body() body: MfaChallengeDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.mfaService.challenge(body.mfaToken, body.token);
    res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000 });
    return { accessToken: tokens.accessToken };
  }
}
