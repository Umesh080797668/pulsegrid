import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from '@otplib/preset-default';
import * as crypto from 'crypto';
import { AuthStore } from './auth.store';
import { AuthService } from './auth.service';
import { AuthTokens, MfaSetupResult } from './auth.types';

@Injectable()
export class MfaService {
  constructor(
    private readonly authStore: AuthStore,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  async setup(userId: string): Promise<MfaSetupResult> {
    const user = await this.authService.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const secret = authenticator.generateSecret();
    const encryptedSecret = this.encryptSecret(secret);
    await this.authStore.upsertMfaSecret({
      userId,
      totpSecret: encryptedSecret,
      enabled: false,
    });

    return {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, 'PulseGrid', secret),
    };
  }

  async verify(userId: string, token: string): Promise<{ success: boolean }> {
    const user = await this.authService.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const mfaRecord = await this.authStore.getMfaByUserId(userId);
    if (!mfaRecord) {
      throw new UnauthorizedException('MFA not configured');
    }

    const secret = this.decryptSecret(mfaRecord.totp_secret);
    const isValid = authenticator.verify({ token, secret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.authStore.enableMfa(userId);
    return { success: true };
  }

  async challenge(mfaToken: string, token: string): Promise<AuthTokens> {
    let payload: { sub?: string; email?: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(mfaToken, {
        secret: process.env.JWT_MFA_SECRET || process.env.JWT_SECRET || 'pulsegrid-dev-mfa-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid MFA token');
    }

    if (payload.purpose !== 'mfa' || !payload.sub) {
      throw new UnauthorizedException('Invalid MFA token');
    }

    const mfaRecord = await this.authStore.getMfaByUserId(payload.sub);
    if (!mfaRecord || !mfaRecord.enabled) {
      throw new UnauthorizedException('MFA is not enabled');
    }

    const secret = this.decryptSecret(mfaRecord.totp_secret);
    const isValid = authenticator.verify({ token, secret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    return this.authService.issueTokensForUserId(payload.sub);
  }

  private encryptSecret(secret: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  private decryptSecret(payload: string): string {
    const [ivB64, tagB64, encryptedB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !encryptedB64) {
      throw new UnauthorizedException('Invalid MFA secret payload');
    }

    const key = this.getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private getEncryptionKey(): Buffer {
    const material = process.env.MFA_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'pulsegrid-dev-mfa-encryption-secret';
    return crypto.createHash('sha256').update(material).digest();
  }
}
