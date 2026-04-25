import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RateLimitService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async check(key: string, limit: number, windowSeconds: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    if (count > limit) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
