import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConnectorsService } from './connectors.service';

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
}
