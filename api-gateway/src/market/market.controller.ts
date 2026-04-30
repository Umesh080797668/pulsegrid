import { Controller, Get, Post, Param, Body, UseGuards, Request, Inject, Query, BadRequestException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { lastValueFrom } from 'rxjs';
import { Request as ExpressRequest } from 'express';

interface PulseCoreService {
  listMarketTemplates(data: { category: string }): any;
  installTemplate(data: { workspaceId: string, templateId: string }): any;
  getMarketTemplate(data: { templateId: string }): any;
  publishMarketTemplate(data: {
    creatorWorkspaceId: string;
    title: string;
    description: string;
    flowDefinitionJson: string;
    priceCents: number;
    category: string;
  }): any;
  rateMarketTemplate(data: {
    templateId: string;
    userId: string;
    rating: number;
    reviewText: string;
  }): any;
}

interface AuthenticatedRequest extends ExpressRequest {
  user?: { sub?: string; workspaceId?: string };
}

interface PublishTemplateBody {
  title?: string;
  description?: string;
  flow_definition?: unknown;
  price_cents?: number;
  category?: string;
}

interface RateTemplateBody {
  rating?: number;
  review_text?: string;
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
    const res = await lastValueFrom(this.pulseCoreService.getMarketTemplate({ templateId: id }));
    const template = res as any;

    return {
      id: template.id,
      title: template.title,
      description: template.description,
      flow_definition: this.parseFlowDefinition(template.flow_definition_json ?? template.flowDefinitionJson),
      price_cents: template.price_cents ?? template.priceCents,
      category: template.category,
      published: template.published,
      rating_avg: template.rating_avg ?? template.ratingAvg,
      creator_workspace_id: template.creator_workspace_id ?? template.creatorWorkspaceId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async publishTemplate(@Body() body: PublishTemplateBody, @Request() req: AuthenticatedRequest) {
    const title = body.title?.trim();
    if (!title) {
      throw new BadRequestException('title is required');
    }

    const flowDefinitionJson = typeof body.flow_definition === 'string'
      ? body.flow_definition
      : JSON.stringify(body.flow_definition ?? {});
    const priceCents = Number(body.price_cents ?? 0);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      throw new BadRequestException('price_cents must be a non-negative number');
    }
    const creatorWorkspaceId = req.user?.workspaceId || req.user?.sub || '';

    const res = await lastValueFrom(this.pulseCoreService.publishMarketTemplate({
      creatorWorkspaceId,
      title,
      description: body.description?.trim() || '',
      flowDefinitionJson,
      priceCents,
      category: body.category?.trim() || '',
    }));

    return res;
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/rate')
  async rateTemplate(
    @Param('id') id: string,
    @Body() body: RateTemplateBody,
    @Request() req: AuthenticatedRequest,
  ) {
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('rating must be an integer between 1 and 5');
    }

    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException('Authenticated user id missing');
    }

    const res = await lastValueFrom(this.pulseCoreService.rateMarketTemplate({
      templateId: id,
      userId,
      rating,
      reviewText: body.review_text?.trim() || '',
    }));

    return res;
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

  private parseFlowDefinition(raw: unknown) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
