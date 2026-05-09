# Connector Plugin System - Architecture & Usage

## Overview

PulseGrid's Connector Plugin System provides a scalable, tiered architecture for integrating 500+ external services. The system enforces strict contracts, supports three certification tiers, and includes sandboxed execution with rate limiting, timeout management, and comprehensive monitoring.

## Architecture

### Core Components

1. **Connector Plugin Interface (`IConnectorPlugin`)**
   - Defines the contract all connectors must implement
   - Requires: `getMetadata()`, `initialize()`, `execute()`, credential validation
   - Optional: `shutdown()`, `getHealth()`, `getFieldOptions()`

2. **Connector Registry (`ConnectorPluginRegistry`)**
   - Central registry for all loaded connectors
   - Supports filtering by tier, category
   - Manages certifications and health status
   - Thread-safe singleton pattern

3. **Lifecycle Manager (`ConnectorLifecycleManager`)**
   - Handles initialization/shutdown with dependency resolution
   - Detects circular dependencies
   - Coordinates across all connectors
   - Monitors health status

4. **Sandboxed Executor (`SandboxedConnectorExecutor`)**
   - Isolates connector execution
   - Enforces timeouts (default 30s)
   - Rate limiting (default 10 req/sec, 300 req/min)
   - Metrics tracking and error handling
   - Credential validation before execution

5. **Certification System (`ConnectorCertificationManager`)**
   - Contract tests: Interface compliance
   - Security tests: No hardcoded secrets, error message safety
   - Performance tests: Initialization speed < 5s
   - Documentation tests: Completeness validation

### Connector Tiers

- **Tier 1 (Certified)**: Production-ready, high-volume support, SLA-backed
  - Examples: Slack, Gmail, Stripe, Salesforce, GitHub
  - Count: ~100 connectors
  - Certification: Full contract, security, performance, documentation tests pass

- **Tier 2 (Vetted)**: Good quality, moderate support
  - Examples: AWS S3, MongoDB, PostgreSQL, Twilio, Mailchimp
  - Count: ~150 connectors
  - Certification: Contract and basic security tests pass

- **Tier 3 (Community)**: Limited/experimental support
  - Examples: Niche services, beta integrations, custom APIs
  - Count: ~250 connectors
  - Certification: Basic contract tests pass

**Total: 500+ connectors**

## Implementation

### Implementing a Connector

```typescript
import {
  IConnectorPlugin,
  ConnectorMetadata,
  ConnectorAuthType,
  ConnectorAction,
  ConnectorExecutionContext,
  ConnectorExecutionResult,
} from '@pulsegrid/connector-plugin';

export class StripeConnector implements IConnectorPlugin {
  getMetadata(): ConnectorMetadata {
    return {
      id: 'stripe',
      name: 'Stripe',
      version: '1.0.0',
      description: 'Accept payments and manage customers with Stripe',
      category: 'finance',
      tier: 'tier1',
      auth: {
        type: 'api_key',
        fields: {
          'api_key': 'Stripe Secret API Key',
        },
      },
      actions: [
        {
          id: 'create_charge',
          name: 'Create Charge',
          description: 'Charge a customer',
          inputs: {
            required: {
              'amount': { type: 'number', description: 'Amount in cents' },
              'currency': { type: 'string', description: 'Currency (USD, EUR, etc.)' },
              'customer_id': { type: 'string', description: 'Stripe customer ID' },
            },
            optional: {
              'description': { type: 'string', description: 'Charge description' },
              'metadata': { type: 'object', description: 'Custom metadata' },
            },
          },
          outputs: {
            'charge_id': { type: 'string', description: 'Stripe charge ID' },
            'amount': { type: 'number', description: 'Amount charged' },
            'status': { type: 'string', description: 'Charge status' },
          },
        },
      ],
    };
  }

  async initialize(): Promise<void> {
    // Setup any required initialization
    // Load configuration, validate API access, etc.
  }

  async validateCredentials(
    credentials: Record<string, any>,
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const errors = [];
    if (!credentials.api_key) {
      errors.push('Missing api_key');
    }
    if (!credentials.api_key?.startsWith('sk_')) {
      errors.push('Invalid Stripe secret key format');
    }
    return { valid: errors.length === 0, errors };
  }

  async testConnection(
    credentials: Record<string, any>,
  ): Promise<{ connected: boolean; error?: string }> {
    try {
      const stripe = require('stripe')(credentials.api_key);
      await stripe.customers.list({ limit: 1 });
      return { connected: true };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  async execute(
    actionId: string,
    inputs: Record<string, any>,
    credentials: Record<string, any>,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorExecutionResult> {
    try {
      if (actionId === 'create_charge') {
        const stripe = require('stripe')(credentials.api_key);
        const charge = await stripe.charges.create({
          amount: inputs.amount,
          currency: inputs.currency,
          customer: inputs.customer_id,
          description: inputs.description,
          metadata: inputs.metadata,
        });

        return {
          success: true,
          data: {
            charge_id: charge.id,
            amount: charge.amount,
            status: charge.status,
          },
        };
      }

      return {
        success: false,
        error: `Unknown action: ${actionId}`,
        errorCode: 'UNKNOWN_ACTION',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Execution failed',
        errorCode: 'EXECUTION_ERROR',
        errorStack: err instanceof Error ? err.stack : undefined,
        retryable: true,
      };
    }
  }

  async shutdown?(): Promise<void> {
    // Cleanup resources
  }

  async getHealth?(): Promise<{ healthy: boolean; uptime?: number; error?: string }> {
    // Return connector health status
    return { healthy: true };
  }
}
```

### Registering Connectors

```typescript
import { ConnectorPluginRegistry, ConnectorLifecycleManager } from '@pulsegrid/connector-plugin';
import { StripeConnector } from './connectors/stripe';

// Create registry
const registry = new ConnectorPluginRegistry();
const lifecycleManager = new ConnectorLifecycleManager(registry);

// Register connectors
registry.register(new StripeConnector());
registry.register(new SlackConnector());
registry.register(new GitHubConnector());
// ... etc

// Initialize all
await lifecycleManager.initializeAll();

// Check health
const healthStatus = await lifecycleManager.checkAllHealth();
for (const [connectorId, health] of healthStatus) {
  console.log(`${connectorId}: ${health.healthy ? '✓' : '✗'}`);
}
```

### Executing Actions

```typescript
import { SandboxedConnectorExecutor, SandboxConfig } from '@pulsegrid/connector-plugin';

const executor = new SandboxedConnectorExecutor();

const result = await executor.execute(
  stripeConnector,
  'create_charge',
  {
    amount: 2000, // $20.00
    currency: 'USD',
    customer_id: 'cus_123456',
  },
  {
    api_key: 'sk_test_xxxxx',
  },
  {
    workspaceId: 'ws_123',
    userId: 'user_456',
    sandboxed: true,
  },
  {
    timeout: 5000,
    rateLimit: {
      requestsPerSecond: 10,
      requestsPerMinute: 600,
    },
  },
);

if (result.success) {
  console.log('Charge created:', result.data.charge_id);
} else {
  console.error('Charge failed:', result.error, result.errorCode);
}
```

### Certification

```typescript
import { ConnectorCertificationManager } from '@pulsegrid/connector-plugin';

const certManager = new ConnectorCertificationManager();

const result = await certManager.certify(myConnector);

console.log(certManager.getCertificationSummary(result));
// Output:
// Connector Certification Report
// ================================
// Connector: my_connector (tier1)
// Status: ✓ PASSED
//
// Test Results:
//   Total: 13
//   Passed: 13
//   Failed: 0
```

## API Endpoints (NestJS Integration)

### List Connectors

```
GET /api/v1/connectors
GET /api/v1/connectors?tier=tier1
GET /api/v1/connectors?category=communication
```

Response:
```json
{
  "total": 500,
  "connectors": [
    {
      "id": "stripe",
      "name": "Stripe",
      "version": "1.0.0",
      "description": "...",
      "category": "finance",
      "tier": "tier1",
      "certified": true,
      "certifiedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Connector Details

```
GET /api/v1/connectors/:connectorId
```

### Test Connector Credentials

```
POST /api/v1/connectors/:connectorId/test
{
  "credentials": {
    "api_key": "sk_test_xxx"
  }
}
```

### Execute Connector Action

```
POST /api/v1/connectors/:connectorId/execute
{
  "actionId": "create_charge",
  "inputs": {
    "amount": 2000,
    "currency": "USD",
    "customer_id": "cus_123"
  },
  "credentials": {
    "api_key": "sk_test_xxx"
  }
}
```

### Get Connector Health

```
GET /api/v1/connectors/:connectorId/health
```

## Testing

Run the comprehensive test suite:

```bash
npm test -- src/connector-plugin/connector.spec.ts
```

Tests cover:
- Registry operations (register, unregister, filter)
- Lifecycle management (init, shutdown, dependency resolution)
- Sandboxed execution (timeout, rate limiting, metrics)
- Certification (contract, security, performance, docs)
- Catalog (500+ connectors, tier distribution)

## Monitoring & Observability

### Metrics

```typescript
// Get execution metrics
const metrics = executor.getMetrics('stripe');
console.log(`Success rate: ${metrics.successRate * 100}%`);
console.log(`Avg duration: ${metrics.avgDuration}ms`);
console.log(`Errors: ${JSON.stringify(metrics.errors)}`);
```

### Rate Limiting Stats

```typescript
const stats = executor.getRateLimiterStats('workspace-1', 'stripe');
console.log(`Total requests: ${stats.total}`);
console.log(`Requests in last minute: ${stats.lastMinute}`);
```

### Health Monitoring

```typescript
const health = await lifecycleManager.checkAllHealth();
for (const [connectorId, status] of health) {
  console.log(`${connectorId}: ${status.uptime}ms, healthy=${status.healthy}`);
  if (status.issues) {
    console.log(`  Issues: ${status.issues.join(', ')}`);
  }
}
```

## Best Practices

1. **Credential Security**
   - Never log or expose credentials
   - Validate credentials before execution
   - Use encrypted storage for secrets
   - Rotate API keys regularly

2. **Error Handling**
   - Return meaningful error messages without leaking sensitive data
   - Use `errorCode` for client-side retry logic
   - Include `retryable` flag for transient failures
   - Log full stack traces only internally

3. **Performance**
   - Implement connection pooling for long-lived services
   - Cache field options when possible
   - Use exponential backoff for retries
   - Monitor and optimize p95 latencies

4. **Reliability**
   - Implement circuit breaker pattern for unhealthy connectors
   - Health checks should be lightweight
   - Support graceful shutdown
   - Document rate limits and quotas

5. **Testing**
   - Unit tests for action logic
   - Integration tests with sandboxed executor
   - Contract compliance tests (included)
   - Performance benchmarks for tier1 connectors

## Migration from Old Catalog

The old hardcoded catalog in `connectorCatalog.ts` is now superseded by the plugin system with 500+ connectors. To migrate:

1. Run certification on all connectors
2. Implement fallback to old catalog for backwards compatibility
3. Gradually move users to new plugin system
4. Deprecate old API endpoints after migration period

## Future Enhancements

- Custom connector builder UI
- Connector marketplace
- Community connector submission process
- Advanced connector analytics dashboard
- Multi-region connector deployments
- A/B testing for connector actions
- Machine learning for connector recommendations
