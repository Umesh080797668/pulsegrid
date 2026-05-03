package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

/**
 * Request to export audit logs with filtering options.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditExportRequest {
    
    @NotNull
    private UUID workspaceId;
    
    private UUID userId;
    
    private String eventType;
    
    private String resourceType;
    
    private Instant startTime;
    
    private Instant endTime;
    
    @NotNull
    private String format;  // "csv" or "pdf"
    
    @Builder.Default
    private int limit = 10000;
    
    @Builder.Default
    private boolean includeDetails = true;
}
