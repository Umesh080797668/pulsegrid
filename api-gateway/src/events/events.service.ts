import { Injectable, Logger } from '@nestjs/common';

export interface Event {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  data: Record<string, any>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger('EventsService');

  /**
   * Stream events from a source
   * In production, this would connect to a real event bus
   * For now, returns mock events
   */
  async streamEvents(source?: string, type?: string): Promise<Event[]> {
    this.logger.log(`Fetching events for source: ${source}, type: ${type}`);

    // In a real implementation, this would:
    // 1. Query the database for recent events matching source/type filters
    // 2. Connect to a message broker (RabbitMQ, Kafka, etc.) for live streaming
    // 3. Push events to the client via SSE or WebSocket

    // Mock events for now
    const events: Event[] = [
      {
        id: '1',
        source: source || 'webhook',
        type: type || 'http',
        timestamp: new Date().toISOString(),
        data: { message: 'Sample event 1', status: 'success' },
      },
      {
        id: '2',
        source: source || 'webhook',
        type: type || 'http',
        timestamp: new Date(Date.now() - 1000).toISOString(),
        data: { message: 'Sample event 2', status: 'success' },
      },
      {
        id: '3',
        source: source || 'webhook',
        type: type || 'http',
        timestamp: new Date(Date.now() - 2000).toISOString(),
        data: { message: 'Sample event 3', status: 'failed' },
      },
    ];

    return events;
  }
}
