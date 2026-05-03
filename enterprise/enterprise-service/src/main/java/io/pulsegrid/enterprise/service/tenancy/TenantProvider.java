package io.pulsegrid.enterprise.service.tenancy;

import java.util.UUID;

/**
 * Provides tenant information resolved from various sources (header, JWT, etc).
 */
public interface TenantProvider {

    /**
     * Resolves the tenant ID from the current context.
     * @return tenant ID (workspace UUID)
     */
    UUID resolveTenantId();

    /**
     * Resolves the tenant plan type.
     */
    TenantContext.TenantPlan resolveTenantPlan();

    /**
     * Generates the schema name based on tenant ID and plan.
     */
    String resolveSchemaName(UUID tenantId, TenantContext.TenantPlan plan);
}
