import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthTokens, AuthUser, JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  private readonly usersByEmail = new Map<string, AuthUser>();
  private readonly usersById = new Map<string, AuthUser>();
  private readonly refreshTokenHashes = new Map<string, string>();

  constructor(private readonly jwtService: JwtService) {}

  private getAccessTtlSeconds(): number {
    return Number(process.env.JWT_ACCESS_TTL_SECONDS || 900);
  }

  private getRefreshTtlSeconds(): number {
    return Number(process.env.JWT_REFRESH_TTL_SECONDS || 60 * 60 * 24 * 30);
  }

  async register(email: string, password: string, name?: string): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new BadRequestException('Email already exists');
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const user: AuthUser = {
      id,
      email: normalizedEmail,
      name,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    this.usersByEmail.set(normalizedEmail, user);
    this.usersById.set(id, user);

    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.usersByEmail.get(normalizedEmail);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'pulsegrid-dev-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const storedUserId = this.refreshTokenHashes.get(tokenHash);
    if (!storedUserId || storedUserId !== payload.sub) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const user = this.usersById.get(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    this.refreshTokenHashes.delete(tokenHash);
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    this.refreshTokenHashes.delete(tokenHash);
  }

  async socialLogin(provider: 'google' | 'github', email: string, name?: string): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();
    let user = this.usersByEmail.get(normalizedEmail);

    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        name: name || `${provider}-user`,
        passwordHash: await bcrypt.hash(crypto.randomUUID(), 8),
        createdAt: new Date().toISOString(),
      };
      this.usersByEmail.set(normalizedEmail, user);
      this.usersById.set(user.id, user);
    }

    return this.issueTokens(user);
  }

  private async issueTokens(user: AuthUser): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET || 'pulsegrid-dev-access-secret',
      expiresIn: this.getAccessTtlSeconds(),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'pulsegrid-dev-refresh-secret',
      expiresIn: this.getRefreshTtlSeconds(),
    });

    this.refreshTokenHashes.set(this.hashToken(refreshToken), user.id);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
