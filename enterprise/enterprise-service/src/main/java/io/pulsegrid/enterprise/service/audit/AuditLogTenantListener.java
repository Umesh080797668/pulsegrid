package io.pulsegrid.enterprise.service.audit;

import io.pulsegrid.enterprise.domain.AuditLog;
import io.pulsegrid.enterprise.service.tenancy.TenantContext;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

import java.util.UUID;

/**
 * JPA listener that binds audit rows to the active tenant context.
 */
public class AuditLogTenantListener {

    @PrePersist
    @PreUpdate
    public void enforceTenantScope(AuditLog auditLog) {
        String currentTenantId = TenantContext.getTenantId();
        if (currentTenantId == null || currentTenantId.isBlank()) {
            return;
        }

        UUID activeWorkspaceId = UUID.fromString(currentTenantId);
        if (auditLog.getWorkspaceId() == null) {
            auditLog.setWorkspaceId(activeWorkspaceId);
            return;
        }

        if (!activeWorkspaceId.equals(auditLog.getWorkspaceId())) {
            throw new TenantAccessDeniedException("Audit log workspace does not match the active tenant context");
        }
    }
}