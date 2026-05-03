package io.pulsegrid.enterprise.service.controller;

import io.pulsegrid.enterprise.domain.AuditLog;
import io.pulsegrid.enterprise.service.dto.AuditLogRequest;
import io.pulsegrid.enterprise.service.service.AuditService;
import io.pulsegrid.enterprise.service.service.AuditExportService;
import io.pulsegrid.enterprise.domain.AuditEventType;
import io.pulsegrid.enterprise.service.tenancy.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
    private final AuditExportService auditExportService;

    @PostMapping("/log")
    public ResponseEntity<AuditLog> logAction(@Valid @RequestBody AuditLogRequest request) {
        UUID workspaceId = request.getWorkspaceId();
        if (workspaceId == null && TenantContext.getTenantId() != null) {
            workspaceId = UUID.fromString(TenantContext.getTenantId());
        }
        AuditEventType eventType = request.getEventType() != null && !request.getEventType().isBlank()
                ? AuditEventType.valueOf(request.getEventType().trim().toUpperCase())
                : AuditEventType.ADMIN_ACTION;
        AuditLog auditLog = auditService.recordPrivilegedAction(
                workspaceId,
                request.getUserId(),
                eventType,
                request.getAction(),
                request.getResourceType(),
                request.getResourceId(),
                request.getBeforeState(),
                request.getAfterState(),
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

    @GetMapping("/timeline/{workspaceId}")
    public ResponseEntity<List<AuditLog>> getAuditTimeline(
            @PathVariable UUID workspaceId,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String resourceId,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "500") int limit) {
        return ResponseEntity.ok(auditService.getTimeline(workspaceId, userId, eventType, resourceType, resourceId, from, to, limit));
    }

    @GetMapping(value = "/export/{workspaceId}")
    public ResponseEntity<byte[]> exportAuditTimeline(
            @PathVariable UUID workspaceId,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String resourceId,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "csv") String format,
            @RequestParam(defaultValue = "5000") int limit) {
        byte[] payload = auditExportService.exportAuditLogs(workspaceId, userId, eventType, resourceType, resourceId, from, to, format, limit);
        String extension = "pdf".equalsIgnoreCase(format) ? "pdf" : "csv";
        MediaType mediaType = "pdf".equalsIgnoreCase(format)
                ? MediaType.APPLICATION_PDF
                : new MediaType("text", "csv");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=audit-timeline-" + workspaceId + "." + extension)
                .contentType(mediaType)
                .body(payload);
    }
}
