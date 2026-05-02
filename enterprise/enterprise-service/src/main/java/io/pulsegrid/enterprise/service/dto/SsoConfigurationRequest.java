package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SsoConfigurationRequest {

    @NotNull(message = "workspaceId is required")
    private UUID workspaceId;

    @NotBlank(message = "provider is required")
    private String provider;

    @NotBlank(message = "metadata is required")
    private String metadata;

    private Boolean enabled;
}
