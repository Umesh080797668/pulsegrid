package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GdprErasureResponse {
    private UUID workspaceId;
    private UUID userId;
    private UUID placeholderUserId;
    private long deletedAuditLogs;
    private long anonymizedFlowRuns;
    private long purgedCredentials;
}