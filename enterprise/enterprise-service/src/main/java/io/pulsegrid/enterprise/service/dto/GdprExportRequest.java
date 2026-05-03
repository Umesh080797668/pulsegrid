package io.pulsegrid.enterprise.service.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GdprExportRequest {

    @NotNull(message = "workspaceId is required")
    private UUID workspaceId;

    @NotNull(message = "userId is required")
    private UUID userId;
}