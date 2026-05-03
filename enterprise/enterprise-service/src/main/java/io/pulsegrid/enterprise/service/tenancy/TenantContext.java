package io.pulsegrid.enterprise.service.tenancy;

import java.util.UUID;

/**
 * Thread-local context for managing the current tenant in a multi-tenant application.
 * Enterprise customers get their own PostgreSQL schema (tenant_{uuid}).
 */
public final class TenantContext {

    private static final ThreadLocal<String> TENANT_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> SCHEMA_NAME = new ThreadLocal<>();
    private static final ThreadLocal<TenantPlan> TENANT_PLAN = new ThreadLocal<>();

    public enum TenantPlan {
        FREE, PRO, ENTERPRISE
    }

    private TenantContext() {
        // Utility class
    }

    /**
     * Sets the current tenant ID (workspace UUID).
     */
    public static void setTenantId(String tenantId) {
        TENANT_ID.set(tenantId);
    }

    /**
     * Gets the current tenant ID.
     */
    public static String getTenantId() {
        return TENANT_ID.get();
    }

    /**
     * Sets the schema name for the current tenant.
     */
    public static void setSchemaName(String schemaName) {
        SCHEMA_NAME.set(schemaName);
    }

    /**
     * Gets the schema name for the current tenant.
     * For enterprise tenants: tenant_{uuid}
     * For free/pro: shared schema
     */
    public static String getSchemaName() {
        return SCHEMA_NAME.get();
    }

    /**
     * Sets the tenant plan type.
     */
    public static void setTenantPlan(TenantPlan plan) {
        TENANT_PLAN.set(plan);
    }

    /**
     * Gets the tenant plan type.
     */
    public static TenantPlan getTenantPlan() {
        return TENANT_PLAN.get();
    }

    /**
     * Checks if the current tenant is an enterprise customer.
     */
    public static boolean isEnterpriseTenant() {
        return TENANT_PLAN.get() == TenantPlan.ENTERPRISE;
    }

    /**
     * Clears all tenant context.
     */
    public static void clear() {
        TENANT_ID.remove();
        SCHEMA_NAME.remove();
        TENANT_PLAN.remove();
    }

    /**
     * Generates schema name for enterprise tenant.
     */
    public static String generateEnterpriseSchemaName(UUID tenantId) {
        return "tenant_" + tenantId.toString().replace("-", "");
    }

    /**
     * Default shared schema name for free/pro tenants.
     */
    public static String getSharedSchemaName() {
        return "public";
    }
}
