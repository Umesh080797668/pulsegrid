/**
 * Core connector plugin types and interfaces
 * Defines the contract all connectors must implement
 */

export type ConnectorAuthType = 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed' | 'basic' | 'custom';

export type ConnectorTier = 'tier1' | 'tier2' | 'tier3'; // tier1 = certified, tier2 = vetted, tier3 = community

export interface ConnectorAuthConfig {
  type: ConnectorAuthType;
  fields: Record<string, string>; // field name -> description
  required?: string[];
  scopes?: string[]; // for OAuth
  docs?: string;
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  inputs: {
    required: Record<string, ConnectorInputField>;
    optional?: Record<string, ConnectorInputField>;
  };
  outputs: {
    [key: string]: ConnectorOutputField;
  };
  docs?: string;
}

export interface ConnectorInputField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum' | 'select';
  description: string;
  default?: any;
  enum?: string[];
  pattern?: string; // regex for validation
  docs?: string;
}

export interface ConnectorOutputField {
  type: string;
  description: string;
  optional?: boolean;
}

export interface ConnectorMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string; // e.g., 'communication', 'productivity', 'finance', 'ai', 'developer', etc.
  tier: ConnectorTier;
  auth: ConnectorAuthConfig;
  actions: ConnectorAction[];
  baseUrl?: string; // for API connectors
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
  };
  retryable?: boolean;
  timeout?: number; // milliseconds
  docs?: string;
  author?: string;
  tags?: string[];
  certified?: boolean;
  certificationDate?: string;
  dependencies?: string[]; // IDs of other connectors this depends on
}

export interface ConnectorExecutionContext {
  workspaceId: string;
  userId?: string;
  credentials?: Record<string, any>;
  timeout?: number;
  sandboxed?: boolean;
  metadata?: Record<string, any>;
}

export interface ConnectorExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  errorCode?: string;
  errorStack?: string;
  duration?: number; // milliseconds
  retryable?: boolean;
}

export interface IConnectorPlugin {
  /**
   * Get metadata about this connector
   */
  getMetadata(): ConnectorMetadata;

  /**
   * Initialize the connector (async setup)
   */
  initialize(): Promise<void>;

  /**
   * Validate credentials format
   */
  validateCredentials(credentials: Record<string, any>): Promise<{ valid: boolean; errors?: string[] }>;

  /**
   * Test connection with given credentials
   */
  testConnection(credentials: Record<string, any>): Promise<{ connected: boolean; error?: string }>;

  /**
   * Execute an action
   */
  execute(
    actionId: string,
    inputs: Record<string, any>,
    credentials: Record<string, any>,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorExecutionResult>;

  /**
   * Get available enum values for a field (for dynamic dropdowns)
   */
  getFieldOptions?(fieldPath: string, credentials: Record<string, any>): Promise<Array<{ label: string; value: string }>>;

  /**
   * Cleanup/shutdown hook
   */
  shutdown?(): Promise<void>;

  /**
   * Get health status
   */
  getHealth?(): Promise<{ healthy: boolean; uptime?: number; error?: string }>;
}

export interface ConnectorRegistry {
  register(connector: IConnectorPlugin): void;
  unregister(connectorId: string): void;
  get(connectorId: string): IConnectorPlugin | null;
  getAll(): IConnectorPlugin[];
  getByTier(tier: ConnectorTier): IConnectorPlugin[];
  getByCategory(category: string): IConnectorPlugin[];
}

export interface ConnectorCertification {
  connectorId: string;
  tier: ConnectorTier;
  certifiedAt: Date;
  certifiedBy: string;
  testResults: {
    contractTests: boolean;
    securityScan: boolean;
    performanceTest: boolean;
    documentation: boolean;
  };
  issues?: string[];
}

export interface ConnectorHealthStatus {
  connectorId: string;
  healthy: boolean;
  uptime: number;
  lastCheck: Date;
  errorRate?: number;
  p95Latency?: number;
  issues?: string[];
}
