package io.pulsegrid.enterprise.service.tenancy;

import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Default implementation of TenantProvider that resolves tenant information from TenantContext.
 */
@Component
public class DefaultTenantProvider implements TenantProvider {

    @Override
    public UUID resolveTenantId() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) {
            throw new TenantResolutionException("No tenant ID found in context");
        }
        try {
            return UUID.fromString(tenantId);
        } catch (IllegalArgumentException e) {
            throw new TenantResolutionException("Invalid tenant ID format: " + tenantId, e);
        }
    }

    @Override
    public TenantContext.TenantPlan resolveTenantPlan() {
        TenantContext.TenantPlan plan = TenantContext.getTenantPlan();
        if (plan == null) {
            throw new TenantResolutionException("No tenant plan found in context");
        }
        return plan;
    }

    @Override
    public String resolveSchemaName(UUID tenantId, TenantContext.TenantPlan plan) {
        if (plan == TenantContext.TenantPlan.ENTERPRISE) {
            return TenantContext.generateEnterpriseSchemaName(tenantId);
        }
        return TenantContext.getSharedSchemaName();
    }
}
