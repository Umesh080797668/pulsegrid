import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface Event {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  data: Record<string, any>;
}

type RedisStreamEntry = [string, string[]];

@Injectable()
export class EventsService {
  private readonly logger = new Logger('EventsService');

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async streamEvents(source?: string, type?: string, workspaceId?: string): Promise<Event[]> {
    this.logger.log(`Fetching events for source: ${source}, type: ${type}, workspaceId: ${workspaceId}`);

    const streamKeys = workspaceId
      ? [`stream:events:${workspaceId}`]
      : (await this.redis.keys('stream:events:*')).sort();

    if (streamKeys.length === 0) {
      return [];
    }

    const perStreamLimit = 25;
    const merged: Event[] = [];

    for (const streamKey of streamKeys) {
      const entries = (await this.redis.xrevrange(streamKey, '+', '-', 'COUNT', perStreamLimit)) as RedisStreamEntry[];

      for (const [entryId, fieldValues] of entries) {
        const payloadIndex = fieldValues.findIndex((value) => value === 'payload');
        if (payloadIndex < 0 || payloadIndex + 1 >= fieldValues.length) {
          continue;
        }

        try {
          const payload = JSON.parse(fieldValues[payloadIndex + 1]) as Record<string, any>;
          const eventSource = typeof payload.source === 'string' ? payload.source : 'system';
          const eventType = typeof payload.event_type === 'string'
            ? payload.event_type
            : (typeof payload.type === 'string' ? payload.type : 'unknown');
          const eventTimestamp = typeof payload.timestamp === 'string'
            ? payload.timestamp
            : (typeof payload.received_at === 'string' ? payload.received_at : new Date().toISOString());

          if (source && eventSource !== source) {
            continue;
          }
          if (type && eventType !== type) {
            continue;
          }

          merged.push({
            id: typeof payload.id === 'string' ? payload.id : entryId,
            source: eventSource,
            type: eventType,
            timestamp: eventTimestamp,
            data: payload,
          });
        } catch (error) {
          this.logger.warn(`Skipping malformed stream payload from ${streamKey}: ${entryId}`);
        }
      }
    }

    return merged
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 100);
  }
}
