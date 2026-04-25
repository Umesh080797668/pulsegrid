import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'pulsegrid-dev-access-secret',
      });

      (request as Request & { user?: unknown }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
