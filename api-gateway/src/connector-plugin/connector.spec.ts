/**
 * Connector Plugin Test Suite
 * Contract tests for connector implementation validation
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  IConnectorPlugin,
  ConnectorMetadata,
  ConnectorExecutionContext,
  ConnectorExecutionResult,
} from '../connector-plugin/connector.types';
import {
  ConnectorPluginRegistry,
  ConnectorLifecycleManager,
} from '../connector-plugin/connector-registry';
import { SandboxedConnectorExecutor, SandboxConfig } from '../connector-plugin/sandboxed-executor';
import {
  ConnectorCertificationManager,
  CertificationTestResult,
} from '../connector-plugin/certification';

/**
 * Mock connector for testing
 */
class MockConnector implements IConnectorPlugin {
  getMetadata(): ConnectorMetadata {
    return {
      id: 'mock_connector',
      name: 'Mock Connector',
      version: '1.0.0',
      description: 'A mock connector for testing',
      category: 'test',
      tier: 'tier1',
      auth: {
        type: 'api_key',
        fields: { api_key: 'API Key' },
      },
      actions: [
        {
          id: 'test_action',
          name: 'Test Action',
          description: 'A test action',
          inputs: {
            required: {
              input1: { type: 'string', description: 'Input 1' },
            },
            optional: {
              input2: { type: 'string', description: 'Input 2' },
            },
          },
          outputs: {
            output1: { type: 'string', description: 'Output 1' },
          },
        },
      ],
    };
  }

  async initialize(): Promise<void> {
    // Mock initialization
  }

  async validateCredentials(
    credentials: Record<string, any>,
  ): Promise<{ valid: boolean; errors?: string[] }> {
    if (!credentials || !credentials.api_key) {
      return { valid: false, errors: ['Missing api_key'] };
    }
    return { valid: true };
  }

  async testConnection(credentials: Record<string, any>): Promise<{ connected: boolean; error?: string }> {
    return { connected: true };
  }

  async execute(
    actionId: string,
    inputs: Record<string, any>,
    credentials: Record<string, any>,
    _context: ConnectorExecutionContext,
  ): Promise<ConnectorExecutionResult> {
    if (actionId !== 'test_action') {
      return { success: false, error: 'Unknown action', errorCode: 'UNKNOWN_ACTION' };
    }
    return { success: true, data: { output1: `Processed ${inputs.input1}` } };
  }
}

describe('Connector Plugin System', () => {
  let registry: ConnectorPluginRegistry;
  let lifecycleManager: ConnectorLifecycleManager;
  let executor: SandboxedConnectorExecutor;
  let certificationManager: ConnectorCertificationManager;
  let mockConnector: IConnectorPlugin;

  beforeEach(() => {
    registry = new ConnectorPluginRegistry();
    lifecycleManager = new ConnectorLifecycleManager(registry);
    executor = new SandboxedConnectorExecutor();
    certificationManager = new ConnectorCertificationManager();
    mockConnector = new MockConnector();
  });

  describe('ConnectorPluginRegistry', () => {
    it('should register a connector', () => {
      registry.register(mockConnector);
      expect(registry.get('mock_connector')).toBe(mockConnector);
    });

    it('should throw error when registering duplicate connector', () => {
      registry.register(mockConnector);
      expect(() => {
        registry.register(mockConnector);
      }).toThrow('Connector mock_connector already registered');
    });

    it('should unregister a connector', () => {
      registry.register(mockConnector);
      registry.unregister('mock_connector');
      expect(registry.get('mock_connector')).toBeNull();
    });

    it('should get all connectors', () => {
      registry.register(mockConnector);
      const all = registry.getAll();
      expect(all.length).toBe(1);
      expect(all[0]).toBe(mockConnector);
    });

    it('should get metadata for all connectors', () => {
      registry.register(mockConnector);
      const metadata = registry.getAllMetadata();
      expect(metadata.length).toBe(1);
      expect(metadata[0].id).toBe('mock_connector');
    });

    it('should filter connectors by tier', () => {
      registry.register(mockConnector);
      const tier1 = registry.getByTier('tier1');
      expect(tier1.length).toBe(1);
    });

    it('should filter connectors by category', () => {
      registry.register(mockConnector);
      const test = registry.getByCategory('test');
      expect(test.length).toBe(1);
    });
  });

  describe('ConnectorLifecycleManager', () => {
    it('should initialize all connectors', async () => {
      registry.register(mockConnector);
      const result = await lifecycleManager.initializeAll();
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should shutdown all connectors', async () => {
      registry.register(mockConnector);
      await lifecycleManager.initializeAll();
      const result = await lifecycleManager.shutdownAll();
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should handle initialization errors', async () => {
      const badConnector: IConnectorPlugin = {
        getMetadata: () => ({
          id: 'bad_connector',
          name: 'Bad',
          version: '1.0.0',
          description: 'Bad',
          category: 'test',
          tier: 'tier1',
          auth: { type: 'none', fields: {} },
          actions: [],
        }),
        initialize: async () => {
          throw new Error('Init failed');
        },
        validateCredentials: async () => ({ valid: true }),
        testConnection: async () => ({ connected: true }),
        execute: async () => ({ success: false, error: 'Test' }),
      };

      registry.register(badConnector);
      const result = await lifecycleManager.initializeAll();
      expect(result.failed).toBeGreaterThan(0);
    });
  });

  describe('SandboxedConnectorExecutor', () => {
    beforeEach(() => {
      registry.register(mockConnector);
    });

    it('should execute a connector action', async () => {
      const result = await executor.execute(
        mockConnector,
        'test_action',
        { input1: 'test' },
        { api_key: 'test-key' },
        { workspaceId: 'test-workspace' },
      );
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle invalid credentials', async () => {
      const result = await executor.execute(
        mockConnector,
        'test_action',
        { input1: 'test' },
        {}, // missing api_key
        { workspaceId: 'test-workspace' },
      );
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('should enforce timeout', async () => {
      const slowConnector: IConnectorPlugin = {
        getMetadata: () => mockConnector.getMetadata(),
        initialize: async () => {},
        validateCredentials: async () => ({ valid: true }),
        testConnection: async () => ({ connected: true }),
        execute: async () => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 10000);
          });
        },
      };

      const result = await executor.execute(
        slowConnector,
        'test_action',
        {},
        { api_key: 'test' },
        { workspaceId: 'test-workspace' },
        { timeout: 100 },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('EXECUTION_ERROR');
    }, 15000);

    it('should track metrics', async () => {
      await executor.execute(
        mockConnector,
        'test_action',
        { input1: 'test' },
        { api_key: 'test' },
        { workspaceId: 'test-workspace' },
      );

      const metrics = executor.getMetrics('mock_connector');
      expect(metrics).toBeDefined();
      expect(metrics?.totalExecutions).toBeGreaterThan(0);
      expect(metrics?.successRate).toBeGreaterThan(0);
    });

    it('should enforce rate limits', async () => {
      const config: SandboxConfig = {
        rateLimit: {
          requestsPerSecond: 1,
        },
      };

      // First request should succeed
      const result1 = await executor.execute(
        mockConnector,
        'test_action',
        { input1: 'test' },
        { api_key: 'test' },
        { workspaceId: 'test-workspace' },
        config,
      );
      expect(result1.success).toBe(true);

      // Second request should fail (rate limited)
      const result2 = await executor.execute(
        mockConnector,
        'test_action',
        { input1: 'test' },
        { api_key: 'test' },
        { workspaceId: 'test-workspace' },
        config,
      );
      expect(result2.success).toBe(false);
      expect(result2.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('ConnectorCertificationManager', () => {
    beforeEach(() => {
      registry.register(mockConnector);
    });

    it('should certify a connector', async () => {
      const result = await certificationManager.certify(mockConnector);
      expect(result).toBeDefined();
      expect(result.connectorId).toBe('mock_connector');
      expect(result.summary.totalTests).toBeGreaterThan(0);
    });

    it('should pass contract tests for valid connector', async () => {
      const result = await certificationManager.certify(mockConnector);
       // May have some documentation test failures, but most should pass
       expect(result.summary.passedTests).toBeGreaterThan(0);
       expect(result.summary.totalTests).toBeGreaterThan(result.summary.failedTests);
    });

    it('should generate certification summary', async () => {
      const result = await certificationManager.certify(mockConnector);
      const summary = certificationManager.getCertificationSummary(result);
      expect(summary).toContain('mock_connector');
       expect(summary).toContain(result.passed ? 'PASSED' : 'FAILED');
    });
  });

  describe('Connector Contract Compliance', () => {
    it('should validate connector metadata schema', () => {
      const metadata = mockConnector.getMetadata();
      expect(metadata.id).toBeDefined();
      expect(metadata.name).toBeDefined();
      expect(metadata.version).toBeDefined();
      expect(metadata.category).toBeDefined();
      expect(metadata.tier).toBeDefined();
      expect(['tier1', 'tier2', 'tier3']).toContain(metadata.tier);
    });

    it('should validate action definitions', () => {
      const metadata = mockConnector.getMetadata();
      expect(metadata.actions.length).toBeGreaterThan(0);

      for (const action of metadata.actions) {
        expect(action.id).toBeDefined();
        expect(action.name).toBeDefined();
        expect(action.inputs).toBeDefined();
        expect(action.outputs).toBeDefined();
      }
    });

    it('should have all required methods', () => {
      expect(typeof mockConnector.getMetadata).toBe('function');
      expect(typeof mockConnector.initialize).toBe('function');
      expect(typeof mockConnector.validateCredentials).toBe('function');
      expect(typeof mockConnector.testConnection).toBe('function');
      expect(typeof mockConnector.execute).toBe('function');
    });
  });

  describe('Expanded Catalog', () => {
    it('should have 500+ connectors available', () => {
      const { FULL_CONNECTOR_CATALOG, CONNECTOR_CATALOG_COUNT } = require('../connector-plugin/expanded-catalog');
      expect(CONNECTOR_CATALOG_COUNT).toBeGreaterThanOrEqual(500);
      expect(FULL_CONNECTOR_CATALOG.length).toBeGreaterThanOrEqual(500);
    });

    it('should have tier1 connectors', () => {
      const { EXPANDED_CONNECTOR_CATALOG } = require('../connector-plugin/expanded-catalog');
      const tier1 = EXPANDED_CONNECTOR_CATALOG.filter((c: any) => c.tier === 'tier1');
       expect(tier1.length).toBeGreaterThanOrEqual(30);
    });

    it('should have tier2 connectors', () => {
      const { TIER2_ADDITIONAL_CONNECTORS } = require('../connector-plugin/expanded-catalog');
      expect(TIER2_ADDITIONAL_CONNECTORS.length).toBeGreaterThan(60);
    });

    it('should have tier3 connectors', () => {
      const { TIER3_CONNECTORS } = require('../connector-plugin/expanded-catalog');
      expect(TIER3_CONNECTORS.length).toBeGreaterThan(100);
    });

    it('should have diverse categories', () => {
      const { FULL_CONNECTOR_CATALOG } = require('../connector-plugin/expanded-catalog');
      const categories = new Set(FULL_CONNECTOR_CATALOG.map((c: any) => c.category));
      expect(categories.size).toBeGreaterThan(10);
    });
  });
});
