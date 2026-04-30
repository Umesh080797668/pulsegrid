import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

interface FcmToken {
  token: string;
  platform: 'ios' | 'android';
  deviceName?: string;
  registeredAt: number;
}

@Injectable()
export class UsersService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  /**
   * Save FCM token for a user
   * Stores in Redis with namespace: fcm_tokens:{userId}
   */
  async saveFcmToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android',
    deviceName?: string,
  ): Promise<void> {
    if (!token || !token.trim()) {
      throw new BadRequestException('FCM token is required');
    }

    if (!platform || !['ios', 'android'].includes(platform)) {
      throw new BadRequestException('Platform must be "ios" or "android"');
    }

    const fcmToken: FcmToken = {
      token: token.trim(),
      platform,
      deviceName: deviceName || 'Unknown Device',
      registeredAt: Date.now(),
    };

    // Store in Redis with user namespacing
    // Key format: fcm_tokens:{userId}:{token}
    const key = `fcm_tokens:${userId}:${token}`;
    await this.redis.setex(
      key,
      90 * 24 * 60 * 60, // 90 days expiry
      JSON.stringify(fcmToken),
    );

    // Also maintain a set of user's token IDs for quick lookup
    const userTokensKey = `fcm_tokens:${userId}:list`;
    await this.redis.sadd(userTokensKey, token);
    await this.redis.expire(userTokensKey, 90 * 24 * 60 * 60);
  }

  /**
   * Get all FCM tokens for a user
   */
  async getUserFcmTokens(userId: string): Promise<FcmToken[]> {
    const userTokensKey = `fcm_tokens:${userId}:list`;
    const tokenIds = await this.redis.smembers(userTokensKey);

    if (!tokenIds || tokenIds.length === 0) {
      return [];
    }

    const tokens: FcmToken[] = [];
    for (const tokenId of tokenIds) {
      const key = `fcm_tokens:${userId}:${tokenId}`;
      const data = await this.redis.get(key);
      if (data) {
        tokens.push(JSON.parse(data));
      }
    }

    return tokens;
  }

  /**
   * Remove FCM token
   */
  async removeFcmToken(userId: string, token: string): Promise<void> {
    const key = `fcm_tokens:${userId}:${token}`;
    const userTokensKey = `fcm_tokens:${userId}:list`;

    await this.redis.del(key);
    await this.redis.srem(userTokensKey, token);
  }

  /**
   * Get all FCM tokens for a workspace (admin only)
   * Used by scheduler for sending daily digest notifications
   */
  async getWorkspaceFcmTokens(workspaceId: string): Promise<
    Array<{
      userId: string;
      tokens: FcmToken[];
    }>
  > {
    // This would require workspace-user mapping in your database
    // For now, returning empty array - should be implemented with proper DB schema
    return [];
  }
}
