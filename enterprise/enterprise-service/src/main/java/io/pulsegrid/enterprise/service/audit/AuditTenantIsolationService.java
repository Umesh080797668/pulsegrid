package io.pulsegrid.enterprise.service.audit;

import io.pulsegrid.enterprise.service.tenancy.TenantContext;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Resolves and validates tenant scope for audit operations.
 */
@Component
public class AuditTenantIsolationService {

    /**
     * Resolve the workspace for an audit operation.
     * If the request is already tenant-scoped, it must match the active tenant context.
     */
    public UUID resolveWorkspaceId(UUID requestedWorkspaceId) {
        UUID activeWorkspaceId = resolveActiveWorkspaceId();

        if (requestedWorkspaceId == null) {
            if (activeWorkspaceId == null) {
                throw new TenantAccessDeniedException("Workspace ID is required when no tenant context is available");
            }
            return activeWorkspaceId;
        }

        if (activeWorkspaceId != null && !activeWorkspaceId.equals(requestedWorkspaceId)) {
            throw new TenantAccessDeniedException("Workspace mismatch between request and active tenant context");
        }

        return requestedWorkspaceId;
    }

    /**
     * Ensures the caller is operating inside the current tenant scope for read operations.
     */
    public void assertTenantScope(UUID workspaceId) {
        UUID activeWorkspaceId = resolveActiveWorkspaceId();
        if (activeWorkspaceId != null && !activeWorkspaceId.equals(workspaceId)) {
            throw new TenantAccessDeniedException("Cross-tenant audit access denied");
        }
    }

    private UUID resolveActiveWorkspaceId() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null || tenantId.isBlank()) {
            return null;
        }
        return UUID.fromString(tenantId);
    }
}