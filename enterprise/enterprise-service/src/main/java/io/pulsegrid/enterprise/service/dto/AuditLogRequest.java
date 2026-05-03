package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogRequest {

    private UUID workspaceId;

    @NotNull(message = "userId is required")
    private UUID userId;

    @NotNull(message = "action is required")
    private String action;

    private String resourceType;
    private String resourceId;
    private String details;
    private String ipAddress;
    private String userAgent;
}
