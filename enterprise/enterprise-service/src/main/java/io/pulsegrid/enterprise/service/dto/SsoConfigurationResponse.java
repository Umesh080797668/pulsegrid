package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SsoConfigurationResponse {
    private UUID id;
    private UUID workspaceId;
    private String provider;
    private String entityId;
    private String acsUrl;
    private String idpMetadataXml;
    private String emailAttribute;
    private String roleAttribute;
    private String departmentAttribute;
    private String groupsAttribute;
    private String oidcIssuerUrl;
    private String oidcClientId;
    private Boolean enabled;
    private String samlLoginUrl;
    private String oidcLoginUrl;
    private String serviceProviderMetadataXml;
    private String samlRegistrationId;
    private String oidcRegistrationId;
    private Instant createdAt;
    private Instant updatedAt;
}
