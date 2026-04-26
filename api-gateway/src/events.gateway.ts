import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { validate as isUuid } from 'uuid';
import { AuthStore } from './auth/auth.store';

type SocketJwtPayload = {
  sub?: string;
  email?: string;
};

@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
  },
})
export class EventsGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private streamReader?: Redis;
  private shouldRun = true;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly jwtService: JwtService,
    private readonly authStore: AuthStore,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.getBearerToken(client);
      if (!token) {
        client.emit('ws_error', { error: 'Missing bearer token' });
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<SocketJwtPayload>(token, {
        secret: process.env.JWT_SECRET || 'pulsegrid-dev-access-secret',
      });

      if (!payload?.sub) {
        client.emit('ws_error', { error: 'Invalid token payload' });
        client.disconnect(true);
        return;
      }

      client.data.user = {
        id: payload.sub,
        email: payload.email,
      };
    } catch {
      client.emit('ws_error', { error: 'Unauthorized websocket connection' });
      client.disconnect(true);
    }
  }

  async onModuleInit(): Promise<void> {
    this.streamReader = this.redis.duplicate();
    if (this.streamReader.status === 'wait') {
      await this.streamReader.connect();
    }
    void this.startRelayLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.shouldRun = false;
    if (this.streamReader) {
      await this.streamReader.quit();
    }
  }

  @SubscribeMessage('join_workspace')
  async handleJoinWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ) {
    const userId = client.data?.user?.id as string | undefined;
    if (!userId) {
      return { ok: false, error: 'Unauthorized websocket session' };
    }

    const workspaceId = body?.workspaceId?.trim();
    if (!workspaceId) {
      return { ok: false, error: 'workspaceId is required' };
    }

    if (!isUuid(workspaceId)) {
      return { ok: false, error: 'workspaceId must be a valid UUID' };
    }

    let allowed = false;
    try {
      allowed = await this.authStore.canAccessWorkspace(userId, workspaceId);
    } catch (error) {
      this.logger.warn(`Workspace access check failed for user ${userId}: ${String(error)}`);
      return { ok: false, error: 'Authorization check failed' };
    }

    if (!allowed) {
      return { ok: false, error: 'Forbidden workspace access' };
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

  private getBearerToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      if (authToken.startsWith('Bearer ')) {
        return authToken.slice('Bearer '.length).trim();
      }
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
      return queryToken.trim();
    }

    return null;
  }
}
