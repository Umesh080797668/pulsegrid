package io.pulsegrid.enterprise.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

/**
 * Represents SSO (SAML 2.0 / OIDC) configuration for enterprise workspaces.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "enterprise_sso_config")
public class SsoConfiguration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, name = "workspace_id", unique = true)
    private UUID workspaceId;

    @Column(nullable = false)
    private String provider; // "saml2" or "oidc"

    @Column(name = "entity_id", nullable = false)
    private String entityId;

    @Column(name = "acs_url", nullable = false)
    private String acsUrl;

    @Lob
    @Column(name = "idp_metadata_xml", nullable = false)
    private String idpMetadataXml;

    @Lob
    @Column(name = "attribute_mapping_json", nullable = false)
    private String attributeMappingJson;

    @Column(name = "oidc_issuer_url")
    private String oidcIssuerUrl;

    @Column(name = "oidc_client_id")
    private String oidcClientId;

    @Column(name = "oidc_client_secret")
    private String oidcClientSecret;

    @Column(name = "enabled", nullable = false)
    private Boolean enabled = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
