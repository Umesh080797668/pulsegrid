/**
 * Connector Plugin Registry and Lifecycle Manager
 * Manages plugin registration, initialization, and lifecycle
 */

import {
  IConnectorPlugin,
  ConnectorRegistry,
  ConnectorMetadata,
  ConnectorTier,
  ConnectorHealthStatus,
  ConnectorCertification,
} from './connector.types';

export class ConnectorPluginRegistry implements ConnectorRegistry {
  private plugins: Map<string, IConnectorPlugin> = new Map();
  private metadata: Map<string, ConnectorMetadata> = new Map();
  private certifications: Map<string, ConnectorCertification> = new Map();
  private healthStatus: Map<string, ConnectorHealthStatus> = new Map();
  private initializationOrder: string[] = [];

  /**
   * Register a connector plugin
   */
  register(connector: IConnectorPlugin): void {
    const metadata = connector.getMetadata();
    const id = metadata.id;

    if (this.plugins.has(id)) {
      throw new Error(`Connector ${id} already registered`);
    }

    this.plugins.set(id, connector);
    this.metadata.set(id, metadata);
    console.log(`Registered connector: ${id} v${metadata.version}`);
  }

  /**
   * Unregister a connector plugin
   */
  unregister(connectorId: string): void {
    if (!this.plugins.has(connectorId)) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    this.plugins.delete(connectorId);
    this.metadata.delete(connectorId);
    console.log(`Unregistered connector: ${connectorId}`);
  }

  /**
   * Get a specific connector
   */
  get(connectorId: string): IConnectorPlugin | null {
    return this.plugins.get(connectorId) ?? null;
  }

  /**
   * Get all registered connectors
   */
  getAll(): IConnectorPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get connectors by tier
   */
  getByTier(tier: ConnectorTier): IConnectorPlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.getMetadata().tier === tier);
  }

  /**
   * Get connectors by category
   */
  getByCategory(category: string): IConnectorPlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.getMetadata().category === category);
  }

  /**
   * Get all metadata for catalog
   */
  getAllMetadata(): ConnectorMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get certification status
   */
  getCertification(connectorId: string): ConnectorCertification | null {
    return this.certifications.get(connectorId) ?? null;
  }

  /**
   * Register certification
   */
  setCertification(cert: ConnectorCertification): void {
    this.certifications.set(cert.connectorId, cert);
  }

  /**
   * Get health status
   */
  getHealth(connectorId: string): ConnectorHealthStatus | null {
    return this.healthStatus.get(connectorId) ?? null;
  }

  /**
   * Update health status
   */
  setHealth(health: ConnectorHealthStatus): void {
    this.healthStatus.set(health.connectorId, health);
  }

  /**
   * Get all certifications
   */
  getAllCertifications(): ConnectorCertification[] {
    return Array.from(this.certifications.values());
  }
}

/**
 * Connector Lifecycle Manager
 * Handles initialization, shutdown, and health monitoring
 */
export class ConnectorLifecycleManager {
  private registry: ConnectorPluginRegistry;
  private initialized: Set<string> = new Set();
  private initPromises: Map<string, Promise<void>> = new Map();

  constructor(registry: ConnectorPluginRegistry) {
    this.registry = registry;
  }

  /**
   * Initialize all connectors respecting dependencies
   */
  async initializeAll(): Promise<{ success: number; failed: number; errors: Record<string, string> }> {
    const errors: Record<string, string> = {};
    let success = 0;
    let failed = 0;

    const connectors = this.registry.getAll();
    const initOrder = this.resolveInitializationOrder(connectors);

    console.log(`Initializing ${connectors.length} connectors...`);

    for (const connectorId of initOrder) {
      try {
        await this.initializeConnector(connectorId);
        success++;
      } catch (err) {
        failed++;
        const error = err instanceof Error ? err.message : String(err);
        errors[connectorId] = error;
        console.error(`Failed to initialize ${connectorId}: ${error}`);
      }
    }

    console.log(`Connector initialization complete: ${success} success, ${failed} failed`);
    return { success, failed, errors };
  }

  /**
   * Initialize a single connector
   */
  async initializeConnector(connectorId: string): Promise<void> {
    if (this.initialized.has(connectorId)) {
      return;
    }

    // Check if initialization is already in progress
    if (this.initPromises.has(connectorId)) {
      return this.initPromises.get(connectorId)!;
    }

    const initPromise = (async () => {
      const connector = this.registry.get(connectorId);
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }

      const metadata = connector.getMetadata();

      // Initialize dependencies first
      if (metadata.dependencies) {
        for (const depId of metadata.dependencies) {
          await this.initializeConnector(depId);
        }
      }

      // Initialize the connector
      console.log(`Initializing connector ${connectorId}...`);
      await connector.initialize();
      this.initialized.add(connectorId);
      console.log(`Initialized connector ${connectorId}`);
    })();

    this.initPromises.set(connectorId, initPromise);
    return initPromise;
  }

  /**
   * Shutdown all connectors
   */
  async shutdownAll(): Promise<{ success: number; failed: number }> {
    const connectors = this.registry.getAll();
    let success = 0;
    let failed = 0;

    console.log(`Shutting down ${connectors.length} connectors...`);

    for (const connector of connectors) {
      try {
        if (connector.shutdown) {
          await connector.shutdown();
        }
        success++;
      } catch (err) {
        failed++;
        const error = err instanceof Error ? err.message : String(err);
        console.error(`Failed to shutdown ${connector.getMetadata().id}: ${error}`);
      }
    }

    this.initialized.clear();
    this.initPromises.clear();

    console.log(`Connector shutdown complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Check health of all connectors
   */
  async checkAllHealth(): Promise<Map<string, ConnectorHealthStatus>> {
    const connectors = this.registry.getAll();
    const healthMap = new Map<string, ConnectorHealthStatus>();

    for (const connector of connectors) {
      try {
        const metadata = connector.getMetadata();
        let health = { healthy: true, uptime: 0, lastCheck: new Date() };

        if (connector.getHealth) {
          const result = await connector.getHealth();
          health = { ...health, ...result };
        }

        const status: ConnectorHealthStatus = {
          connectorId: metadata.id,
          ...health,
          lastCheck: new Date(),
        };

        this.registry.setHealth(status);
        healthMap.set(metadata.id, status);
      } catch (err) {
        const metadata = connector.getMetadata();
        const error = err instanceof Error ? err.message : String(err);
        const status: ConnectorHealthStatus = {
          connectorId: metadata.id,
          healthy: false,
          uptime: 0,
          lastCheck: new Date(),
          issues: [error],
        };
        this.registry.setHealth(status);
        healthMap.set(metadata.id, status);
      }
    }

    return healthMap;
  }

  /**
   * Resolve initialization order respecting dependencies
   */
  private resolveInitializationOrder(connectors: IConnectorPlugin[]): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (connectorId: string) => {
      if (visited.has(connectorId)) return;
      if (visiting.has(connectorId)) {
        throw new Error(`Circular dependency detected for ${connectorId}`);
      }

      visiting.add(connectorId);

      const connector = this.registry.get(connectorId);
      if (connector) {
        const metadata = connector.getMetadata();
        if (metadata.dependencies) {
          for (const depId of metadata.dependencies) {
            visit(depId);
          }
        }
      }

      visiting.delete(connectorId);
      visited.add(connectorId);
      order.push(connectorId);
    };

    for (const connector of connectors) {
      visit(connector.getMetadata().id);
    }

    return order;
  }
}
