import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';
import { FlowValidationService } from './flow-validation.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'PULSECORE_PACKAGE',
        transport: Transport.GRPC,
        options: {
          url: 'localhost:50051',
          package: 'pulsecore',
          protoPath: join(__dirname, '../proto/pulsecore.proto'),
        },
      },
    ]),
    AuthModule,
  ],
  controllers: [FlowsController],
  providers: [FlowsService, FlowValidationService],
  exports: [FlowsService, FlowValidationService],
})
export class FlowsModule {}
