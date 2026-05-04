import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { FlowsController } from './flows.controller';
import { ApprovalsController } from './approvals.controller';
import { FlowsService } from './flows.service';
import { FlowValidationService } from './flow-validation.service';
import { FlowVersionsService } from './flow-versions.service';
import { AuthModule } from '../auth/auth.module';
import { ConnectorsModule } from '../connectors/connectors.module';

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
    ConnectorsModule,
  ],
  controllers: [FlowsController, ApprovalsController],
  providers: [FlowsService, FlowValidationService, FlowVersionsService],
  exports: [FlowsService, FlowValidationService, FlowVersionsService],
})
export class FlowsModule {}
