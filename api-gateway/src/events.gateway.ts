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
  private activeWorkspaces = new Set<string>();
  private streamLastIds = new Map<string, string>();

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
    // Track active workspace for stream relay
    const streamKey = `stream:events:${workspaceId}`;
    if (!this.activeWorkspaces.has(workspaceId)) {
      this.activeWorkspaces.add(workspaceId);
      this.streamLastIds.set(streamKey, '$');
    }
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
    // Stop tracking workspace stream when no clients remain
    this.activeWorkspaces.delete(workspaceId);
    this.streamLastIds.delete(`stream:events:${workspaceId}`);
    return { ok: true, workspaceId };
  }

  private async startRelayLoop(): Promise<void> {
    while (this.shouldRun) {
      try {
        if (this.streamLastIds.size === 0) {
          // No active workspaces subscribed; sleep briefly
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        const streams = Array.from(this.streamLastIds.keys());
        const lastIds = Array.from(this.streamLastIds.values());

        const args: Array<string> = ['XREAD', 'BLOCK', '5000', 'COUNT', '25', 'STREAMS', ...streams, ...lastIds];

        const reply = await (this.streamReader as unknown as any).call(...args) as unknown;

        if (!reply || !Array.isArray(reply)) {
          continue;
        }

        for (const streamData of reply) {
          if (!Array.isArray(streamData) || streamData.length < 2) {
            continue;
          }

          const streamName = streamData[0] as string;
          const entries = streamData[1] as Array<[string, string[]]>;
          for (const [entryId, fields] of entries) {
            // update last id for this stream
            this.streamLastIds.set(streamName, entryId);

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

            // Emit to workspace room based on payload tenant_id or derive from stream name
            const tenantId = payload['tenant_id'] && typeof payload['tenant_id'] === 'string'
              ? (payload['tenant_id'] as string)
              : streamName.replace(/^stream:events:/, '');

            if (tenantId && tenantId.length > 0) {
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
