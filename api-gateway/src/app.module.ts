import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';

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
})
export class AppModule {}
