import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthTokens, AuthUser, JwtPayload } from './auth.types';
import { AuthStore } from './auth.store';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authStore: AuthStore,
  ) {}

  private getAccessTtlSeconds(): number {
    return Number(process.env.JWT_ACCESS_TTL_SECONDS || 900);
  }

  private getRefreshTtlSeconds(): number {
    return Number(process.env.JWT_REFRESH_TTL_SECONDS || 60 * 60 * 24 * 30);
  }

  async register(email: string, password: string, name?: string): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.authStore.findUserByEmail(normalizedEmail);
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const row = await this.authStore.createUser({
      id,
      email: normalizedEmail,
      passwordHash,
      fullName: name,
    });

    const user = this.toAuthUser(row);
    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();
    const row = await this.authStore.findUserByEmail(normalizedEmail);
    const user = row ? this.toAuthUser(row) : null;
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
    const storedUserId = await this.authStore.consumeRefreshTokenHash(tokenHash);
    if (!storedUserId || storedUserId !== payload.sub) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const row = await this.authStore.findUserById(payload.sub);
    const user = row ? this.toAuthUser(row) : null;
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.authStore.revokeRefreshTokenHash(tokenHash);
  }

  async socialLogin(provider: 'google' | 'github', email: string, name?: string): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();
    const row = await this.authStore.upsertSocialUser({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      name: name || `${provider}-user`,
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 8),
    });

    const user = this.toAuthUser(row);

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

    const expiresAt = new Date(Date.now() + this.getRefreshTtlSeconds() * 1000);
    await this.authStore.storeRefreshTokenHash({
      tokenHash: this.hashToken(refreshToken),
      userId: user.id,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private toAuthUser(row: {
    id: string;
    email: string;
    password_hash: string | null;
    full_name: string | null;
    created_at: Date;
  }): AuthUser {
    return {
      id: row.id,
      email: row.email,
      name: row.full_name ?? undefined,
      passwordHash: row.password_hash || '',
      createdAt: row.created_at.toISOString(),
    };
  }
}
