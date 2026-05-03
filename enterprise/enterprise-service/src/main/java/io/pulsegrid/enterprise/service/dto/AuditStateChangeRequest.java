package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * Request to log a state change with before and after JSON representation.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditStateChangeRequest {
    
    @NotNull
    private UUID workspaceId;
    
    @NotNull
    private UUID userId;
    
    @NotNull
    private String eventType;
    
    @NotNull
    private String action;
    
    private String resourceType;
    
    private String resourceId;
    
    @NotNull
    private String beforeState;
    
    @NotNull
    private String afterState;
    
    private String details;
    
    @NotNull
    private String ipAddress;
    
    private String userAgent;
}
