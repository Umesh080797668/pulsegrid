package io.pulsegrid.enterprise.service.controller;

import io.pulsegrid.enterprise.domain.AuditLog;
import io.pulsegrid.enterprise.service.dto.AuditLogRequest;
import io.pulsegrid.enterprise.service.service.AuditService;
import io.pulsegrid.enterprise.service.tenancy.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/audit")
@RequiredArgsConstructor
public class AuditController {

    private final AuditService auditService;

    @PostMapping("/log")
    public ResponseEntity<AuditLog> logAction(@Valid @RequestBody AuditLogRequest request) {
        UUID workspaceId = request.getWorkspaceId();
        if (workspaceId == null && TenantContext.getTenantId() != null) {
            workspaceId = UUID.fromString(TenantContext.getTenantId());
        }
        AuditLog auditLog = auditService.logAction(
                workspaceId,
                request.getUserId(),
                request.getAction(),
                request.getResourceType(),
                request.getResourceId(),
                request.getDetails(),
                request.getIpAddress(),
                request.getUserAgent()
        );
        return ResponseEntity.ok(auditLog);
    }

    @GetMapping("/logs/{workspaceId}")
    public ResponseEntity<List<AuditLog>> getAuditLogs(@PathVariable UUID workspaceId) {
        List<AuditLog> logs = auditService.getAuditLogs(workspaceId);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/logs/{workspaceId}/since")
    public ResponseEntity<List<AuditLog>> getAuditLogsSince(
            @PathVariable UUID workspaceId,
            @RequestParam Long since) {
        Instant sinceInstant = Instant.ofEpochMilli(since);
        List<AuditLog> logs = auditService.getAuditLogsSince(workspaceId, sinceInstant);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/logs/{workspaceId}/user/{userId}")
    public ResponseEntity<List<AuditLog>> getUserAuditLogs(
            @PathVariable UUID workspaceId,
            @PathVariable UUID userId) {
        List<AuditLog> logs = auditService.getUserAuditLogs(workspaceId, userId);
        return ResponseEntity.ok(logs);
    }
}
