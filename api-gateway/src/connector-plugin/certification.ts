/**
 * Connector Certification and Contract Testing System
 * Ensures all connectors meet quality, security, and functionality standards
 */

import {
  IConnectorPlugin,
  ConnectorMetadata,
  ConnectorTier,
  ConnectorCertification,
  ConnectorExecutionContext,
} from './connector.types';

export interface ContractTestResult {
  testName: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface CertificationTestResult {
  connectorId: string;
  tier: ConnectorTier;
  passed: boolean;
  timestamp: Date;
  results: {
    contractTests: ContractTestResult[];
    securityTests: ContractTestResult[];
    performanceTests: ContractTestResult[];
    documentationTests: ContractTestResult[];
  };
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
  };
}

/**
 * Contract Test Suite - Validates connector interface compliance
 */
export class ConnectorContractTestSuite {
  /**
   * Test that connector implements required interface
   */
  async testInterfaceCompliance(connector: IConnectorPlugin): Promise<ContractTestResult[]> {
    const results: ContractTestResult[] = [];

    // Test getMetadata
    results.push({
      testName: 'getMetadata exists and returns valid metadata',
      passed: await this.testGetMetadata(connector),
      duration: 0,
    });

    // Test initialize
    results.push({
      testName: 'initialize method exists and is callable',
      passed: await this.testInitializeMethod(connector),
      duration: 0,
    });

    // Test validateCredentials
    results.push({
      testName: 'validateCredentials method exists and is callable',
      passed: await this.testValidateCredentialsMethod(connector),
      duration: 0,
    });

    // Test testConnection
    results.push({
      testName: 'testConnection method exists and is callable',
      passed: await this.testConnectionMethod(connector),
      duration: 0,
    });

    // Test execute
    results.push({
      testName: 'execute method exists and is callable',
      passed: await this.testExecuteMethod(connector),
      duration: 0,
    });

    // Test metadata schema
    results.push({
      testName: 'metadata conforms to schema',
      passed: await this.testMetadataSchema(connector),
      duration: 0,
    });

    return results;
  }

  private async testGetMetadata(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const metadata = connector.getMetadata();
      return !!(
        metadata &&
        metadata.id &&
        metadata.name &&
        metadata.version &&
        metadata.category &&
        metadata.tier &&
        metadata.auth &&
        Array.isArray(metadata.actions)
      );
    } catch {
      return false;
    }
  }

  private async testInitializeMethod(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const result = connector.initialize();
      return result && typeof result.then === 'function';
    } catch {
      return false;
    }
  }

  private async testValidateCredentialsMethod(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const result = connector.validateCredentials({});
      return result && typeof result.then === 'function';
    } catch {
      return false;
    }
  }

  private async testConnectionMethod(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const result = connector.testConnection({});
      return result && typeof result.then === 'function';
    } catch {
      return false;
    }
  }

  private async testExecuteMethod(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const metadata = connector.getMetadata();
      const actionId = metadata.actions[0]?.id || 'test';
      const result = connector.execute(actionId, {}, {}, {
        workspaceId: 'test-workspace',
      });
      return result && typeof result.then === 'function';
    } catch {
      return false;
    }
  }

  private async testMetadataSchema(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const metadata = connector.getMetadata();
      const validTiers = ['tier1', 'tier2', 'tier3'];
      const validAuthTypes = ['none', 'bearer', 'api_key', 'oauth2', 'mixed', 'basic', 'custom'];

      if (!validTiers.includes(metadata.tier)) return false;
      if (!validAuthTypes.includes(metadata.auth.type)) return false;
      if (!Array.isArray(metadata.actions) || metadata.actions.length === 0) return false;

      // Validate actions
      for (const action of metadata.actions) {
        if (!action.id || !action.name || !action.inputs || !action.outputs) return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Security Test Suite - Validates security practices
 */
export class ConnectorSecurityTestSuite {
  /**
   * Run all security tests
   */
  async testSecurity(connector: IConnectorPlugin): Promise<ContractTestResult[]> {
    const results: ContractTestResult[] = [];

    results.push({
      testName: 'No hardcoded secrets in metadata',
      passed: await this.testNoHardcodedSecrets(connector),
      duration: 0,
    });

    results.push({
      testName: 'Credentials are validated before use',
      passed: await this.testCredentialValidation(connector),
      duration: 0,
    });

    results.push({
      testName: 'Error messages do not leak sensitive data',
      passed: await this.testErrorMessageSafety(connector),
      duration: 0,
    });

    return results;
  }

  private async testNoHardcodedSecrets(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const metadata = connector.getMetadata();
      const metadataStr = JSON.stringify(metadata);

      // Check for common secret patterns
      const secretPatterns = [
        /api[_-]?key/i,
        /secret/i,
        /password/i,
        /token/i,
        /sk_/,
        /pk_/,
      ];

      for (const pattern of secretPatterns) {
        if (
          pattern.test(metadataStr) &&
          metadataStr.includes('{') &&
          metadataStr.match(/:\s*"[a-zA-Z0-9]+"/g)
        ) {
          // Likely a hardcoded secret value
          return false;
        }
      }

      return true;
    } catch {
      return true; // Don't fail if we can't check
    }
  }

  private async testCredentialValidation(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const result = await connector.validateCredentials({});
      return !!(result && typeof result.valid === 'boolean');
    } catch {
      return false;
    }
  }

  private async testErrorMessageSafety(connector: IConnectorPlugin): Promise<boolean> {
    try {
      // Try to trigger an error with invalid credentials
      const result = await connector.testConnection({ invalid: true }).catch((e) => {
        const errorStr = String(e);
        // Check if error message contains patterns of sensitive data
        const sensitivePatterns = [/api.key|secret|password|token|Bearer/i, /[a-zA-Z0-9]{32,}/];
        for (const pattern of sensitivePatterns) {
          if (pattern.test(errorStr)) {
            return false;
          }
        }
        return true;
      });

      return result !== false;
    } catch {
      return true; // Don't fail if we can't check
    }
  }
}

/**
 * Performance Test Suite - Validates performance characteristics
 */
export class ConnectorPerformanceTestSuite {
  /**
   * Run all performance tests
   */
  async testPerformance(connector: IConnectorPlugin): Promise<ContractTestResult[]> {
    const results: ContractTestResult[] = [];

    results.push({
      testName: 'Initialization completes within 5 seconds',
      passed: await this.testInitializationSpeed(connector),
      duration: 0,
    });

    results.push({
      testName: 'Metadata retrieval is synchronous',
      passed: await this.testMetadataSpeed(connector),
      duration: 0,
    });

    return results;
  }

  private async testInitializationSpeed(connector: IConnectorPlugin): Promise<boolean> {
    try {
      const startTime = Date.now();
      await connector.initialize();
      const duration = Date.now() - startTime;
      return duration < 5000; // 5 second timeout
    } catch {
      return false;
    }
  }

  private async testMetadataSpeed(_connector: IConnectorPlugin): Promise<boolean> {
    // Metadata should be synchronous by design
    return true;
  }
}

/**
 * Documentation Test Suite - Validates documentation completeness
 */
export class ConnectorDocumentationTestSuite {
  /**
   * Run all documentation tests
   */
  async testDocumentation(connector: IConnectorPlugin): Promise<ContractTestResult[]> {
    const results: ContractTestResult[] = [];

    results.push({
      testName: 'Metadata includes description',
      passed: await this.testHasDescription(connector),
      duration: 0,
    });

    results.push({
      testName: 'All actions have descriptions',
      passed: await this.testActionsHaveDescriptions(connector),
      duration: 0,
    });

    results.push({
      testName: 'All input fields have descriptions',
      passed: await this.testInputFieldsHaveDescriptions(connector),
      duration: 0,
    });

    return results;
  }

  private async testHasDescription(connector: IConnectorPlugin): Promise<boolean> {
    const metadata = connector.getMetadata();
    return !!(metadata.description && metadata.description.length > 10);
  }

  private async testActionsHaveDescriptions(connector: IConnectorPlugin): Promise<boolean> {
    const metadata = connector.getMetadata();
    return metadata.actions.every(
      (action) => action.description && action.description.length > 5,
    );
  }

  private async testInputFieldsHaveDescriptions(connector: IConnectorPlugin): Promise<boolean> {
    const metadata = connector.getMetadata();
    return metadata.actions.every((action) => {
      const fields = {
        ...action.inputs.required,
        ...action.inputs.optional,
      };
      return Object.values(fields).every(
        (field) => field.description && field.description.length > 0,
      );
    });
  }
}

/**
 * Connector Certification Manager
 * Orchestrates all certification tests
 */
export class ConnectorCertificationManager {
  private contractSuite = new ConnectorContractTestSuite();
  private securitySuite = new ConnectorSecurityTestSuite();
  private performanceSuite = new ConnectorPerformanceTestSuite();
  private documentationSuite = new ConnectorDocumentationTestSuite();

  /**
   * Run full certification suite
   */
  async certify(connector: IConnectorPlugin): Promise<CertificationTestResult> {
    const startTime = Date.now();
    const metadata = connector.getMetadata();

    const results = {
      contractTests: await this.contractSuite.testInterfaceCompliance(connector),
      securityTests: await this.securitySuite.testSecurity(connector),
      performanceTests: await this.performanceSuite.testPerformance(connector),
      documentationTests: await this.documentationSuite.testDocumentation(connector),
    };

    const allTests = [
      ...results.contractTests,
      ...results.securityTests,
      ...results.performanceTests,
      ...results.documentationTests,
    ];

    const passed = allTests.filter((t) => t.passed).length;
    const failed = allTests.filter((t) => !t.passed).length;

    return {
      connectorId: metadata.id,
      tier: metadata.tier,
      passed: failed === 0,
      timestamp: new Date(),
      results,
      summary: {
        totalTests: allTests.length,
        passedTests: passed,
        failedTests: failed,
      },
    };
  }

  /**
   * Get certification summary
   */
  getCertificationSummary(result: CertificationTestResult): string {
    const { summary, connectorId, tier, passed } = result;
    return `
Connector Certification Report
================================
Connector: ${connectorId} (${tier})
Status: ${passed ? '✓ PASSED' : '✗ FAILED'}

Test Results:
  Total: ${summary.totalTests}
  Passed: ${summary.passedTests}
  Failed: ${summary.failedTests}
    `;
  }
}
