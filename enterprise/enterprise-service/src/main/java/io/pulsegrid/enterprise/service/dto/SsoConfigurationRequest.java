package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SsoConfigurationRequest {

    @NotNull(message = "workspaceId is required")
    private UUID workspaceId;

    @NotBlank(message = "provider is required")
    @Pattern(regexp = "^(saml2|oidc)$", message = "provider must be saml2 or oidc")
    private String provider;

    @NotBlank(message = "entityId is required")
    private String entityId;

    @NotBlank(message = "acsUrl is required")
    private String acsUrl;

    @NotBlank(message = "metadata is required")
    private String idpMetadataXml;

    @NotBlank(message = "emailAttribute is required")
    private String emailAttribute;

    private String roleAttribute;

    private String departmentAttribute;

    private String groupsAttribute;

    private String oidcIssuerUrl;

    private String oidcClientId;

    private String oidcClientSecret;

    private Boolean enabled;

    @AssertTrue(message = "OIDC settings are required when provider is oidc")
    public boolean isOidcConfigurationValid() {
        if (!"oidc".equalsIgnoreCase(provider)) {
            return true;
        }
        return oidcIssuerUrl != null && !oidcIssuerUrl.isBlank()
                && oidcClientId != null && !oidcClientId.isBlank();
    }
}
