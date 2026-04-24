import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { Redis } from 'ioredis';
import { ManagementApiKeyGuard } from './management-api-key.guard';

@Global()
@Module({
  imports: [
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
  exports: ['REDIS_CLIENT'],
})
export class AppModule {}
