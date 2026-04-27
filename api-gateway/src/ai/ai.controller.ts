import { Controller, Post, Body, Inject, UseGuards } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface PulseCoreService {
  generateFlowFromPrompt(data: { prompt: string }): any;
  analyzeFailure(data: { errorLog: string }): any;
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  private pulseCoreService!: PulseCoreService;

  constructor(@Inject('PULSECORE_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.pulseCoreService = this.client.getService<PulseCoreService>('PulseCoreService');
  }

  @Post('generate-flow')
  async generateFlow(@Body() body: { prompt: string }) {
    return await lastValueFrom(this.pulseCoreService.generateFlowFromPrompt({ prompt: body.prompt }));
  }

  @Post('analyze-failure')
  async analyzeFailure(@Body() body: { errorLog: string }) {
    return await lastValueFrom(this.pulseCoreService.analyzeFailure({ errorLog: body.errorLog }));
  }
}
