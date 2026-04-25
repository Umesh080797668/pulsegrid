import { Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
  },
})
export class EventsGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private streamReader?: Redis;
  private shouldRun = true;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    this.streamReader = this.redis.duplicate();
    await this.streamReader.connect();
    void this.startRelayLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.shouldRun = false;
    if (this.streamReader) {
      await this.streamReader.quit();
    }
  }

  @SubscribeMessage('join_workspace')
  handleJoinWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ) {
    const workspaceId = body?.workspaceId?.trim();
    if (!workspaceId) {
      return { ok: false, error: 'workspaceId is required' };
    }

    client.join(`workspace:${workspaceId}`);
    return { ok: true, workspaceId };
  }

  @SubscribeMessage('leave_workspace')
  handleLeaveWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ) {
    const workspaceId = body?.workspaceId?.trim();
    if (!workspaceId) {
      return { ok: false, error: 'workspaceId is required' };
    }

    client.leave(`workspace:${workspaceId}`);
    return { ok: true, workspaceId };
  }

  private async startRelayLoop(): Promise<void> {
    let lastId = '$';

    while (this.shouldRun) {
      try {
        const reply = await (this.streamReader as Redis).call(
          'XREAD',
          'BLOCK',
          '5000',
          'COUNT',
          '25',
          'STREAMS',
          'stream:events:global',
          lastId,
        ) as unknown;

        if (!reply || !Array.isArray(reply)) {
          continue;
        }

        for (const streamData of reply) {
          if (!Array.isArray(streamData) || streamData.length < 2) {
            continue;
          }

          const entries = streamData[1] as Array<[string, string[]]>;
          for (const [entryId, fields] of entries) {
            lastId = entryId;
            const payloadIndex = fields.findIndex((item) => item === 'payload');
            if (payloadIndex === -1 || payloadIndex + 1 >= fields.length) {
              continue;
            }

            const payloadRaw = fields[payloadIndex + 1];
            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(payloadRaw);
            } catch {
              continue;
            }

            this.server.emit('event', payload);

            const tenantId = payload['tenant_id'];
            if (typeof tenantId === 'string' && tenantId.length > 0) {
              this.server.to(`workspace:${tenantId}`).emit('workspace_event', payload);
            }
          }
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }
}
