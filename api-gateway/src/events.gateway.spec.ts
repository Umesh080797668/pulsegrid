import { EventsGateway } from './events.gateway';

describe('EventsGateway security', () => {
  const mockRedis = {
    duplicate: jest.fn().mockReturnValue({
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      call: jest.fn().mockResolvedValue(null),
    }),
  } as any;

  const mockJwtService = {
    verifyAsync: jest.fn(),
  } as any;

  const mockAuthStore = {
    canAccessWorkspace: jest.fn(),
  } as any;

  function createGateway() {
    return new EventsGateway(mockRedis, mockJwtService, mockAuthStore);
  }

  function createClient(overrides: Partial<any> = {}) {
    return {
      handshake: {
        auth: {},
        headers: {},
        query: {},
      },
      data: {},
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      ...overrides,
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disconnects websocket connection when token is missing', async () => {
    const gateway = createGateway();
    const client = createClient();

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('ws_error', { error: 'Missing bearer token' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('stores user context when token is valid', async () => {
    const gateway = createGateway();
    const client = createClient({
      handshake: {
        auth: { token: 'Bearer valid.jwt' },
        headers: {},
        query: {},
      },
    });
    mockJwtService.verifyAsync.mockResolvedValue({ sub: '2df3f8fd-3dfd-44d4-91f7-9dabeb5af7a0', email: 'user@example.com' });

    await gateway.handleConnection(client);

    expect(client.data.user).toEqual({
      id: '2df3f8fd-3dfd-44d4-91f7-9dabeb5af7a0',
      email: 'user@example.com',
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects workspace join when user cannot access workspace', async () => {
    const gateway = createGateway();
    const client = createClient({ data: { user: { id: '2df3f8fd-3dfd-44d4-91f7-9dabeb5af7a0' } } });
    mockAuthStore.canAccessWorkspace.mockResolvedValue(false);

    const result = await gateway.handleJoinWorkspace(client, {
      workspaceId: 'c32491e0-fb2f-4e57-a63b-cf1d523dfce3',
    });

    expect(result).toEqual({ ok: false, error: 'Forbidden workspace access' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('joins workspace room when authorized', async () => {
    const gateway = createGateway();
    const client = createClient({ data: { user: { id: '2df3f8fd-3dfd-44d4-91f7-9dabeb5af7a0' } } });
    mockAuthStore.canAccessWorkspace.mockResolvedValue(true);

    const result = await gateway.handleJoinWorkspace(client, {
      workspaceId: 'c32491e0-fb2f-4e57-a63b-cf1d523dfce3',
    });

    expect(result).toEqual({ ok: true, workspaceId: 'c32491e0-fb2f-4e57-a63b-cf1d523dfce3' });
    expect(client.join).toHaveBeenCalledWith('workspace:c32491e0-fb2f-4e57-a63b-cf1d523dfce3');
  });
});
