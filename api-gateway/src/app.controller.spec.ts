import { AppController } from './app.controller';

describe('AppController catalog endpoints', () => {
  const mockService = {
    triggerFlow: jest.fn(),
    setWorkspaceSecret: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  };

  const mockGrpcClient = {
    getService: jest.fn().mockReturnValue(mockService),
  } as any;

  const mockRedis = {
    set: jest.fn(),
    xadd: jest.fn(),
  } as any;

  const mockRateLimit = {
    check: jest.fn(),
  } as any;

  function createController() {
    const controller = new AppController(mockGrpcClient, mockRedis, mockRateLimit);
    controller.onModuleInit();
    return controller;
  }

  it('returns connector catalog with expected entries', () => {
    const controller = createController();
    const catalog = controller.getConnectorCatalog() as { count: number; items: Array<{ connector: string }> };

    expect(catalog.count).toBeGreaterThan(10);
    expect(catalog.items.some((item) => item.connector === 'stripe')).toBe(true);
    expect(catalog.items.some((item) => item.connector === 'openai')).toBe(true);
  });

  it('returns custom schema aliases consistent with catalog', () => {
    const controller = createController();
    const schema = controller.getCustomConnectorSchema() as { supported_connector_aliases: string[] };

    expect(schema.supported_connector_aliases).toContain('resend');
    expect(schema.supported_connector_aliases).toContain('jira');
    expect(schema.supported_connector_aliases).not.toContain('custom');
  });
});
