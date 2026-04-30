import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { Redis } from 'ioredis';
import { ManagementApiKeyGuard } from './management-api-key.guard';
import { BetaModule } from "./beta/beta.module";
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RateLimitService } from './rate-limit.service';
import { EventsGateway } from './events.gateway';
import { MarketModule } from './market/market.module';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GraphqlModule } from './graphql/graphql.module';
import { FlowsModule } from './flows/flows.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { EventsModule } from './events/events.module';
import { ScheduleModule } from '@nestjs/schedule';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    GraphqlModule,
    BetaModule,
    AuthModule,
    UsersModule,
    MarketModule,
    AiModule,
    AnalyticsModule,
    FlowsModule,
    ConnectorsModule,
    EventsModule,
    ClientsModule.register([
      {
        name: 'PULSECORE_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'pulsecore',
          protoPath: './src/proto/pulsecore.proto',
          url: '127.0.0.1:50051',
        },
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    ManagementApiKeyGuard,
    RateLimitService,
    EventsGateway,
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        });
      },
    },
  ],
  exports: ['REDIS_CLIENT', RateLimitService],
})
export class AppModule {}
