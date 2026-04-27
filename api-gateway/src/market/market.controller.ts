import { Controller, Get, Post, Param, Body, UseGuards, Request, Inject, Query } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { lastValueFrom } from 'rxjs';

interface PulseCoreService {
  listMarketTemplates(data: { category: string }): any;
  installTemplate(data: { workspaceId: string, templateId: string }): any;
}

@Controller('market/templates')
export class MarketController {
  private pulseCoreService!: PulseCoreService;

  constructor(@Inject('PULSECORE_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.pulseCoreService = this.client.getService<PulseCoreService>('PulseCoreService');
  }

  @Get()
  async listTemplates(@Query('category') category: string) {
    const res = await lastValueFrom(this.pulseCoreService.listMarketTemplates({ category: category || '' }));
    return (res as any).templates || [];
  }

  @Get(':id')
  async getTemplate(@Param('id') id: string) {
    return { id, title: 'Sample Template', description: 'Placeholder for now', flow_definition: {} };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/install')
  async installTemplate(@Param('id') id: string, @Request() req: any) {
    const res = await lastValueFrom(this.pulseCoreService.installTemplate({ 
        workspaceId: req.user.workspaceId, 
        templateId: id 
    }));
    return res;
  }
}
