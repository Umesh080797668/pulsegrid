package io.pulsegrid.enterprise.service.tenancy.hibernate;

import io.pulsegrid.enterprise.service.tenancy.TenantContext;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.stereotype.Component;

/**
 * Hibernate's CurrentTenantIdentifierResolver implementation.
 * Provides the current tenant identifier to Hibernate for multi-tenancy support.
 */
@Component
public class PulseGridTenantIdentifierResolver implements CurrentTenantIdentifierResolver<String> {

    private static final String DEFAULT_TENANT_ID = "public";

    @Override
    public String resolveCurrentTenantIdentifier() {
        String schemaName = TenantContext.getSchemaName();
        if (schemaName == null || schemaName.isEmpty()) {
            return DEFAULT_TENANT_ID;
        }
        return schemaName;
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }
}
