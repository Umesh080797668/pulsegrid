import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Logger,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConnectorsService } from './connectors.service';
import { Request as ExpressRequest } from 'express';

@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class ConnectorsController {
  private readonly logger = new Logger('ConnectorsController');

  constructor(private connectorsService: ConnectorsService) {}

  /**
   * Test a connector configuration
   * POST /connectors/:connector/test
   * Body: { endpoint_url?, method?, headers?, body?, bearer_token?, api_key_header?, api_key_value? }
   *
   * Returns: { success: boolean, message: string, statusCode?: number, response?: any }
   */
  @Post(':connector/test')
  async testConnector(
    @Param('connector') connector: string,
    @Body() config: Record<string, any>,
  ) {
    try {
      if (!connector || connector.trim().length === 0) {
        throw new BadRequestException('Connector name is required');
      }

      this.logger.log(`Testing connector: ${connector}`);

      const result = await this.connectorsService.testConnector(connector, config);

      return {
        statusCode: 200,
        success: result.success,
        message: result.message,
        testStatusCode: result.statusCode,
        response: result.response,
      };
    } catch (error) {
      this.logger.error(`Error testing connector ${connector}:`, error);
      throw error;
    }
  }

  /**
   * Get flows that depend on a credential
   * GET /credentials/:id/dependents
   *
   * Returns: { statusCode: number, data: { flows: Array<{ id: string, name: string }> } }
   */
  @Get('credentials/:id/dependents')
  async getCredentialDependents(
    @Param('id') credentialId: string,
    @Request() req: ExpressRequest,
  ) {
    try {
      const workspaceId = this.extractWorkspaceId(req);
      this.logger.log(`Fetching dependents for credential ${credentialId}`);

      const dependents = await this.connectorsService.getCredentialDependents(
        credentialId,
        workspaceId,
      );

      return {
        statusCode: 200,
        data: dependents,
      };
    } catch (error) {
      this.logger.error(`Error fetching dependents for credential ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Extract workspace ID from JWT token in request
   * Throws BadRequestException if workspace not found in token
   */
  private extractWorkspaceId(req: ExpressRequest): string {
    const user = (req as ExpressRequest & { user?: any }).user;
    if (!user || !user.workspaceId) {
      throw new BadRequestException('Invalid or missing workspace in JWT token');
    }
    return user.workspaceId;
  }}