package io.pulsegrid.enterprise.service.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.pulsegrid.enterprise.domain.AuditEventType;
import io.pulsegrid.enterprise.domain.AuditLog;
import io.pulsegrid.enterprise.service.audit.AuditLogSpecifications;
import io.pulsegrid.enterprise.service.audit.AuditRequestContext;
import io.pulsegrid.enterprise.service.audit.AuditTenantIsolationService;
import io.pulsegrid.enterprise.service.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Service for managing immutable enterprise audit logs (SOC 2 / compliance).
 * All records are append-only and mirrored to ClickHouse for fast timeline queries.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final AuditTenantIsolationService auditTenantIsolationService;
    private final ObjectMapper objectMapper;
    private final AuditClickHouseService auditClickHouseService;

    public AuditLog recordPrivilegedAction(
            UUID workspaceId,
            UUID actorUserId,
            AuditEventType eventType,
            String action,
            String resourceType,
            String resourceId,
            Object beforeState,
            Object afterState,
            String details,
            String ipAddress,
            String userAgent) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        UUID resolvedActorUserId = actorUserId != null ? actorUserId : Objects.requireNonNullElseGet(AuditRequestContext.resolveActorUserId(), () -> UUID.fromString("00000000-0000-0000-0000-000000000000"));

        AuditLog auditLog = new AuditLog();
        auditLog.setWorkspaceId(resolvedWorkspaceId);
        auditLog.setUserId(resolvedActorUserId);
        auditLog.setEventType(eventType.name());
        auditLog.setAction(action);
        auditLog.setResourceType(resourceType);
        auditLog.setResourceId(resourceId);
        auditLog.setBeforeState(serializeJson(beforeState));
        auditLog.setAfterState(serializeJson(afterState));
        auditLog.setDetails(details != null ? details : buildDiffSummary(beforeState, afterState));
        auditLog.setIpAddress(ipAddress != null ? ipAddress : AuditRequestContext.resolveIpAddress());
        auditLog.setUserAgent(userAgent != null ? userAgent : AuditRequestContext.resolveUserAgent());
        auditLog.setCreatedAt(Instant.now());
        auditLog.setImmutableHash(computeImmutableHash(auditLog));

        AuditLog saved = auditLogRepository.save(auditLog);
        auditClickHouseService.writeAuditLog(saved);
        log.info("Audit record created: workspaceId={}, eventType={}, action={}, resourceType={}, resourceId={}, actorUserId={}",
                resolvedWorkspaceId, eventType, action, resourceType, resourceId, resolvedActorUserId);
        return saved;
    }

    public AuditLog logAction(UUID workspaceId, UUID userId, String action, String resourceType, String resourceId, String details, String ipAddress, String userAgent) {
        return recordPrivilegedAction(
                workspaceId,
                userId,
                AuditEventType.ADMIN_ACTION,
                action,
                resourceType,
                resourceId,
                null,
                null,
                details,
                ipAddress,
                userAgent
        );
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getAuditLogs(UUID workspaceId) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        auditTenantIsolationService.assertTenantScope(resolvedWorkspaceId);
        return auditLogRepository.findByWorkspaceIdOrderByCreatedAtDesc(resolvedWorkspaceId);
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getAuditLogsSince(UUID workspaceId, Instant since) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        auditTenantIsolationService.assertTenantScope(resolvedWorkspaceId);
        return auditLogRepository.findAuditLogsSince(resolvedWorkspaceId, since);
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getUserAuditLogs(UUID workspaceId, UUID userId) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        auditTenantIsolationService.assertTenantScope(resolvedWorkspaceId);
        return auditLogRepository.findByWorkspaceIdAndUserIdOrderByCreatedAtDesc(resolvedWorkspaceId, userId);
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getTimeline(UUID workspaceId, UUID userId, String eventType, String resourceType, String resourceId, Instant from, Instant to, int limit) {
        UUID resolvedWorkspaceId = auditTenantIsolationService.resolveWorkspaceId(workspaceId);
        auditTenantIsolationService.assertTenantScope(resolvedWorkspaceId);

        Specification<AuditLog> specification = AuditLogSpecifications.workspaceIdEquals(resolvedWorkspaceId)
            .and(AuditLogSpecifications.userIdEquals(userId))
            .and(AuditLogSpecifications.eventTypeEquals(eventType))
            .and(AuditLogSpecifications.resourceTypeEquals(resourceType))
            .and(AuditLogSpecifications.resourceIdEquals(resourceId))
            .and(AuditLogSpecifications.createdAfterOrEqual(from))
            .and(AuditLogSpecifications.createdBeforeOrEqual(to));

        return auditLogRepository.findAll(
                specification,
                PageRequest.of(0, Math.max(1, Math.min(limit, 1000)), Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getTimeline(UUID workspaceId, int limit) {
        return getTimeline(workspaceId, null, null, null, null, null, null, limit);
    }

    private String serializeJson(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String stringValue) {
            String trimmed = stringValue.trim();
            if (trimmed.isEmpty()) {
                return null;
            }
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                return trimmed;
            }
            try {
                return objectMapper.writeValueAsString(trimmed);
            } catch (JsonProcessingException e) {
                return '"' + trimmed.replace("\"", "\\\"") + '"';
            }
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return String.valueOf(value);
        }
    }

    private String buildDiffSummary(Object beforeState, Object afterState) {
        try {
            JsonNode beforeNode = beforeState == null ? objectMapper.nullNode() : objectMapper.valueToTree(beforeState);
            JsonNode afterNode = afterState == null ? objectMapper.nullNode() : objectMapper.valueToTree(afterState);
            ObjectNode node = objectMapper.createObjectNode();
            node.put("changed", !beforeNode.equals(afterNode));
            node.set("before", beforeNode);
            node.set("after", afterNode);
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            return "{\"changed\":true}";
        }
    }

    private String computeImmutableHash(AuditLog auditLog) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String payload = String.join("|",
                    safe(auditLog.getWorkspaceId()),
                    safe(auditLog.getUserId()),
                    safe(auditLog.getEventType()),
                    safe(auditLog.getAction()),
                    safe(auditLog.getResourceType()),
                    safe(auditLog.getResourceId()),
                    safe(auditLog.getDetails()),
                    safe(auditLog.getBeforeState()),
                    safe(auditLog.getAfterState()),
                    safe(auditLog.getIpAddress()),
                    safe(auditLog.getUserAgent()),
                    safe(auditLog.getCreatedAt())
            );
            return HexFormat.of().formatHex(digest.digest(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private String safe(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
