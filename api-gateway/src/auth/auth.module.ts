import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthStore } from './auth.store';
import { EmailModule } from '../email/email.module';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'pulsegrid-dev-access-secret',
      signOptions: {
        expiresIn: Number(process.env.JWT_ACCESS_TTL_SECONDS || 900),
      },
    }),
    EmailModule,
  ],
  controllers: [AuthController, MfaController],
  providers: [AuthStore, AuthService, MfaService, JwtAuthGuard],
  exports: [AuthService, MfaService, JwtAuthGuard, AuthStore, JwtModule],
})
export class AuthModule {}
