import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'PULSECORE_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'pulsecore',
          protoPath: join(__dirname, '../proto/pulsecore.proto'),
          url: process.env.PULSECORE_GRPC_URL || 'localhost:50051',
        },
      },
    ]),
  ],
  controllers: [MarketController],
  providers: [],
})
export class MarketModule {}
