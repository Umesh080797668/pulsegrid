import { Controller, Get, Query, UseGuards, Logger, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  private readonly logger = new Logger('EventsController');

  constructor(private eventsService: EventsService) {}

  /**
   * Stream events from a source
   * GET /events/stream?source=&type=
   *
   * Returns Server-Sent Events stream
   * Example: curl -H "Authorization: Bearer TOKEN" http://localhost:3000/events/stream?source=webhook&type=http
   */
  @Get('stream')
  async streamEvents(
    @Query('source') source?: string,
    @Query('type') type?: string,
    @Res() res?: Response,
  ) {
    try {
      this.logger.log(`Streaming events for source: ${source}, type: ${type}`);

      // Set SSE headers
      if (res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
      }

      // Get events stream
      const events = await this.eventsService.streamEvents(source, type);

      // Send events
      for (const event of events) {
        if (res) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }

      if (res) {
        res.end();
      }
    } catch (error) {
      this.logger.error('Error streaming events:', error);
      if (res) {
        res.status(500).json({
          statusCode: 500,
          message: 'Error streaming events',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}
