import { Controller, Get, Inject, OnModuleInit, Post, Body } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface PulseCoreService {
  triggerFlow(data: { workspaceId: string; flowId: string; payloadJson: string }): Observable<any>;
}

@Controller()
export class AppController implements OnModuleInit {
  private pulseCoreService!: PulseCoreService;

  constructor(@Inject('PULSECORE_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.pulseCoreService = this.client.getService<PulseCoreService>('PulseCoreService');
  }

  @Post('trigger')
  triggerFlow(@Body() body: { workspaceId: string; flowId: string; payload: any }) {
    console.log('Sending trigger request to Core Engine over gRPC...', body);
    return this.pulseCoreService.triggerFlow({
      workspaceId: body.workspaceId,
      flowId: body.flowId,
      payloadJson: JSON.stringify(body.payload),
    });
  }

  @Get('health')
  health() {
    return 'API Gateway OK';
  }
}
