package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.domain.AuditLog;
import io.pulsegrid.enterprise.service.audit.AuditTenantIsolationService;
import io.pulsegrid.enterprise.service.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Service for managing enterprise audit logs (compliance, GDPR, SOC2).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final AuditTenantIsolationService auditTenantIsolationService;

    public AuditLog logAction(UUID workspaceId, UUID userId, String action, String resourceType, String resourceId, String details, String ipAddress, String userAgent) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        AuditLog auditLog = new AuditLog();
        auditLog.setWorkspaceId(resolvedWorkspaceId);
        auditLog.setUserId(userId);
        auditLog.setAction(action);
        auditLog.setResourceType(resourceType);
        auditLog.setResourceId(resourceId);
        auditLog.setDetails(details);
        auditLog.setIpAddress(ipAddress);
        auditLog.setUserAgent(userAgent);
        auditLog.setCreatedAt(Instant.now());

        AuditLog saved = auditLogRepository.save(auditLog);
        log.info("Audit log created: workspaceId={}, action={}, userId={}", resolvedWorkspaceId, action, userId);
        return saved;
    }

    public List<AuditLog> getAuditLogs(UUID workspaceId) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        auditTenantIsolationService.assertTenantScope(resolvedWorkspaceId);
        return auditLogRepository.findByWorkspaceIdOrderByCreatedAtDesc(resolvedWorkspaceId);
    }

    public List<AuditLog> getAuditLogsSince(UUID workspaceId, Instant since) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        auditTenantIsolationService.assertTenantScope(resolvedWorkspaceId);
        return auditLogRepository.findAuditLogsSince(resolvedWorkspaceId, since);
    }

    public List<AuditLog> getUserAuditLogs(UUID workspaceId, UUID userId) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        auditTenantIsolationService.assertTenantScope(resolvedWorkspaceId);
        return auditLogRepository.findByWorkspaceIdAndUserIdOrderByCreatedAtDesc(resolvedWorkspaceId, userId);
    }
}
