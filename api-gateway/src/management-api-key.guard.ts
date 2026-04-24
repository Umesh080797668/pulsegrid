import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

@Injectable()
export class ManagementApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.header('x-management-api-key') as string | undefined;
    const expected = process.env.MANAGEMENT_API_KEY;

    if (!expected) {
      throw new UnauthorizedException('Management API key is not configured');
    }

    if (!provided) {
      throw new UnauthorizedException('Missing x-management-api-key header');
    }

    const providedHash = createHash('sha256').update(provided, 'utf8').digest();
    const expectedHash = createHash('sha256').update(expected, 'utf8').digest();

    if (!timingSafeEqual(providedHash, expectedHash)) {
      throw new UnauthorizedException('Invalid management API key');
    }

    return true;
  }
}
