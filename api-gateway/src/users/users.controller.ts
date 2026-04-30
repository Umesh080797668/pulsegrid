import { Body, Controller, Delete, Get, Post, UseGuards, Req } from '@nestjs/common';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { UsersService } from './users.service';
import { Request } from 'express';

class SaveFcmTokenDto {
  @IsString()
  fcmToken!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @IsOptional()
  @IsString()
  deviceName?: string;
}

class RemoveFcmTokenDto {
  @IsString()
  token!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /users/fcm-token
   * Register FCM token for push notifications
   * Requires JWT authentication via Bearer token
   */
  @Post('fcm-token')
  async saveFcmToken(@Body() dto: SaveFcmTokenDto, @Req() req: Request) {
    // Extract user ID from JWT token in request
    // Assuming middleware has decoded and attached to req.user
    const userId = (req as any).user?.id || (req as any).userId;

    if (!userId) {
      return {
        success: false,
        error: 'Unauthorized: No user context',
        statusCode: 401,
      };
    }

    try {
      await this.usersService.saveFcmToken(
        userId,
        dto.fcmToken,
        dto.platform,
        dto.deviceName,
      );

      return {
        success: true,
        message: 'FCM token registered successfully',
        data: {
          fcmToken: dto.fcmToken,
          platform: dto.platform,
          registeredAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        statusCode: 400,
      };
    }
  }

  /**
   * GET /users/fcm-tokens
   * Retrieve all registered FCM tokens for current user
   */
  @Get('fcm-tokens')
  async getUserFcmTokens(@Req() req: Request) {
    const userId = (req as any).user?.id || (req as any).userId;

    if (!userId) {
      return {
        success: false,
        error: 'Unauthorized: No user context',
        statusCode: 401,
      };
    }

    try {
      const tokens = await this.usersService.getUserFcmTokens(userId);
      return {
        success: true,
        data: {
          tokens,
          count: tokens.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        statusCode: 400,
      };
    }
  }

  /**
   * DELETE /users/fcm-token/:token
   * Unregister FCM token (e.g., on logout or device removal)
   */
  @Delete('fcm-token')
  async removeFcmToken(@Body() dto: RemoveFcmTokenDto, @Req() req: Request) {
    const userId = (req as any).user?.id || (req as any).userId;

    if (!userId) {
      return {
        success: false,
        error: 'Unauthorized: No user context',
        statusCode: 401,
      };
    }

    try {
      await this.usersService.removeFcmToken(userId, dto.token);
      return {
        success: true,
        message: 'FCM token removed successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        statusCode: 400,
      };
    }
  }
}
