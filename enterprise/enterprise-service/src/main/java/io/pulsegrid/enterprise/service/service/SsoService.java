package io.pulsegrid.enterprise.service.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pulsegrid.enterprise.domain.SsoConfiguration;
import io.pulsegrid.enterprise.domain.AuditEventType;
import io.pulsegrid.enterprise.service.dto.SsoConfigurationRequest;
import io.pulsegrid.enterprise.service.dto.SsoConfigurationResponse;
import io.pulsegrid.enterprise.service.model.IdpMetadataDetails;
import io.pulsegrid.enterprise.service.model.SsoLoginUrls;
import io.pulsegrid.enterprise.service.model.SsoPrincipalAttributes;
import io.pulsegrid.enterprise.service.model.ValidatedSamlAssertion;
import io.pulsegrid.enterprise.service.repository.SsoConfigurationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.security.saml2.core.Saml2X509Credential;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for managing tenant-level SSO configurations (SAML 2.0 and OIDC).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class SsoService {

    private final SsoConfigurationRepository ssoConfigurationRepository;
    private final SsoMetadataParser ssoMetadataParser;
    private final SsoAttributeMapper ssoAttributeMapper;
    private final SamlAssertionVerifier samlAssertionVerifier;
    private final ObjectMapper objectMapper;
    private final AuditService auditService;

    public Optional<SsoConfiguration> getSsoConfigurationEntity(UUID workspaceId) {
        return ssoConfigurationRepository.findByWorkspaceId(workspaceId);
    }

    public Optional<SsoConfigurationResponse> getSsoConfiguration(UUID workspaceId) {
        return ssoConfigurationRepository.findByWorkspaceId(workspaceId).map(this::toResponse);
    }

    public List<SsoConfigurationResponse> listEnabledConfigurations() {
        return ssoConfigurationRepository.findAll().stream()
                .filter(config -> Boolean.TRUE.equals(config.getEnabled()))
                .map(this::toResponse)
                .toList();
    }

    public SsoConfigurationResponse createOrUpdateSsoConfiguration(SsoConfigurationRequest request) {
        validateRequest(request);

        SsoConfiguration config = ssoConfigurationRepository.findByWorkspaceId(request.getWorkspaceId())
                .orElseGet(SsoConfiguration::new);

        Map<String, Object> beforeState = new java.util.LinkedHashMap<>();
        beforeState.put("workspaceId", config.getWorkspaceId());
        beforeState.put("provider", config.getProvider());
        beforeState.put("enabled", config.getEnabled());
        beforeState.put("entityId", config.getEntityId());
        beforeState.put("acsUrl", config.getAcsUrl());
        beforeState.put("oidcIssuerUrl", config.getOidcIssuerUrl());
        beforeState.put("oidcClientId", config.getOidcClientId());

        config.setWorkspaceId(request.getWorkspaceId());
        config.setProvider(normalizeProvider(request.getProvider()));
        config.setEntityId(request.getEntityId().trim());
        config.setAcsUrl(request.getAcsUrl().trim());
        config.setIdpMetadataXml(request.getIdpMetadataXml().trim());
        config.setAttributeMappingJson(serializeAttributeMapping(request));
        config.setOidcIssuerUrl(trimToNull(request.getOidcIssuerUrl()));
        config.setOidcClientId(trimToNull(request.getOidcClientId()));
        config.setOidcClientSecret(trimToNull(request.getOidcClientSecret()));
        config.setEnabled(Boolean.TRUE.equals(request.getEnabled()));
        config.setUpdatedAt(Instant.now());

        SsoConfiguration saved = ssoConfigurationRepository.save(config);
        auditService.recordPrivilegedAction(
                saved.getWorkspaceId(),
                null,
                AuditEventType.SSO_CONFIG_UPDATED,
                "SSO configuration updated",
                "sso_configuration",
                saved.getWorkspaceId().toString(),
                beforeState,
                saved,
                "Enterprise SSO configuration was created or updated",
                null,
                null
        );
        log.info("SSO configuration updated for workspace={}, provider={}, registrationId={}", saved.getWorkspaceId(), saved.getProvider(), getRegistrationId(saved));
        return toResponse(saved);
    }

    public void enableSso(UUID workspaceId) {
        SsoConfiguration before = requireConfiguration(workspaceId);
        updateEnabledState(workspaceId, true);
        auditService.recordPrivilegedAction(
                workspaceId,
                null,
                AuditEventType.SSO_CONFIG_ENABLED,
                "SSO enabled",
                "sso_configuration",
                workspaceId.toString(),
                before,
                requireConfiguration(workspaceId),
                "SSO was enabled for the workspace",
                null,
                null
        );
    }

    public void disableSso(UUID workspaceId) {
        SsoConfiguration before = requireConfiguration(workspaceId);
        updateEnabledState(workspaceId, false);
        auditService.recordPrivilegedAction(
                workspaceId,
                null,
                AuditEventType.SSO_CONFIG_DISABLED,
                "SSO disabled",
                "sso_configuration",
                workspaceId.toString(),
                before,
                requireConfiguration(workspaceId),
                "SSO was disabled for the workspace",
                null,
                null
        );
    }

    public void deleteSsoConfiguration(UUID workspaceId) {
        ssoConfigurationRepository.findByWorkspaceId(workspaceId).ifPresent(config -> {
            auditService.recordPrivilegedAction(
                    workspaceId,
                    null,
                    AuditEventType.SSO_CONFIG_DELETED,
                    "SSO configuration deleted",
                    "sso_configuration",
                    workspaceId.toString(),
                    config,
                    null,
                    "SSO configuration deleted from enterprise administration",
                    null,
                    null
            );
            ssoConfigurationRepository.delete(config);
        });
    }

    public String buildLoginUrl(UUID workspaceId, String provider, String basePath) {
        SsoConfiguration config = requireConfiguration(workspaceId);
        String normalizedProvider = normalizeProvider(provider);
        String registrationId = getRegistrationId(config, normalizedProvider);
        String loginPath = switch (normalizedProvider) {
            case "oidc" -> "/oauth2/authorization/" + registrationId;
            case "saml2" -> "/saml2/authenticate/" + registrationId;
            default -> throw new IllegalArgumentException("Unsupported provider: " + provider);
        };
        return joinPaths(basePath, loginPath);
    }

    public SsoLoginUrls buildLoginUrls(SsoConfiguration config, String basePath) {
        String samlRegistrationId = getRegistrationId(config, "saml2");
        String oidcRegistrationId = getRegistrationId(config, "oidc");
        return new SsoLoginUrls(
                joinPaths(basePath, "/saml2/authenticate/" + samlRegistrationId),
                joinPaths(basePath, "/oauth2/authorization/" + oidcRegistrationId),
                samlRegistrationId,
                oidcRegistrationId
        );
    }

    public String buildServiceProviderMetadataXml(UUID workspaceId) {
        SsoConfiguration config = requireConfiguration(workspaceId);
        String registrationId = getRegistrationId(config, "saml2");
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="%s">
                  <SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
                    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
                    <AssertionConsumerService index="0" isDefault="true" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="%s"/>
                    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="%s"/>
                    <Extensions>
                      <pulsegrid:registrationId xmlns:pulsegrid="https://pulsegrid.io/sso">%s</pulsegrid:registrationId>
                    </Extensions>
                  </SPSSODescriptor>
                </EntityDescriptor>
                """.formatted(
                config.getEntityId(),
                config.getAcsUrl(),
                joinPaths(config.getAcsUrl(), "/logout/saml2/slo"),
                registrationId
        ).strip();
    }

    public RelyingPartyRegistration buildSamlRelyingPartyRegistration(SsoConfiguration config) {
        if (!"saml2".equalsIgnoreCase(config.getProvider())) {
            throw new IllegalArgumentException("Workspace is not configured for SAML2");
        }
        IdpMetadataDetails metadata = ssoMetadataParser.parse(config.getIdpMetadataXml());
        List<Saml2X509Credential> credentials = new ArrayList<>();
        for (java.security.cert.X509Certificate certificate : metadata.signingCertificates()) {
            credentials.add(new Saml2X509Credential(certificate, Saml2X509Credential.Saml2X509CredentialType.VERIFICATION));
        }
        String registrationId = getRegistrationId(config, "saml2");
        return RelyingPartyRegistration.withRegistrationId(registrationId)
                .entityId(config.getEntityId())
                .assertionConsumerServiceLocation(config.getAcsUrl())
                .signingX509Credentials(creds -> {
                })
                .assertingPartyMetadata(metadataBuilder -> {
                    metadataBuilder.entityId(metadata.entityId());
                    metadataBuilder.singleSignOnServiceLocation(metadata.singleSignOnLocation());
                    if (metadata.singleLogoutLocation() != null) {
                        metadataBuilder.singleLogoutServiceLocation(metadata.singleLogoutLocation());
                    }
                    metadataBuilder.verificationX509Credentials(creds -> creds.addAll(credentials));
                    metadataBuilder.wantAuthnRequestsSigned(true);
                })
                .build();
    }

    public ClientRegistration buildOidcClientRegistration(SsoConfiguration config) {
        if (!"oidc".equalsIgnoreCase(config.getProvider())) {
            throw new IllegalArgumentException("Workspace is not configured for OIDC");
        }
        if (!StringUtils.hasText(config.getOidcIssuerUrl())) {
            throw new IllegalArgumentException("OIDC issuer URL is required");
        }
        String registrationId = getRegistrationId(config, "oidc");
        ClientRegistration.Builder builder = ClientRegistrations.fromIssuerLocation(config.getOidcIssuerUrl())
                .registrationId(registrationId)
                .clientId(required(config.getOidcClientId(), "OIDC client id is required"))
                .clientSecret(required(config.getOidcClientSecret(), "OIDC client secret is required"))
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid", "profile", "email")
                .userNameAttributeName(IdTokenClaimNames.SUB)
                .clientName(config.getEntityId());
        return builder.build();
    }

    public SsoPrincipalAttributes mapSamlAttributes(UUID workspaceId, String provider, org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal principal) {
        SsoConfigurationRequest request = toRequest(requireConfiguration(workspaceId));
        return ssoAttributeMapper.mapFromSaml(workspaceId, provider, principal, request);
    }

    public SsoPrincipalAttributes mapOidcClaims(UUID workspaceId, String provider, org.springframework.security.oauth2.core.oidc.user.OidcUser oidcUser) {
        SsoConfigurationRequest request = toRequest(requireConfiguration(workspaceId));
        return ssoAttributeMapper.mapFromOidc(workspaceId, provider, oidcUser, request);
    }

    public SsoPrincipalAttributes mapClaims(UUID workspaceId, String provider, Map<String, ?> claims) {
        SsoConfigurationRequest request = toRequest(requireConfiguration(workspaceId));
        return ssoAttributeMapper.mapFromClaims(workspaceId, provider, claims, request);
    }

    public ValidatedSamlAssertion verifySignedSamlAssertion(UUID workspaceId, String assertionXml) {
        SsoConfiguration config = requireConfiguration(workspaceId);
        if (!"saml2".equalsIgnoreCase(config.getProvider())) {
            throw new IllegalArgumentException("Workspace is not configured for SAML2");
        }
        IdpMetadataDetails metadata = ssoMetadataParser.parse(config.getIdpMetadataXml());
        return samlAssertionVerifier.verify(assertionXml, metadata.signingCertificates());
    }

    public SsoPrincipalAttributes verifyAndMapSignedSamlAssertion(UUID workspaceId, String assertionXml) {
        ValidatedSamlAssertion validated = verifySignedSamlAssertion(workspaceId, assertionXml);
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", validated.subject());
        claims.put("email", validated.attributes().getOrDefault("email", List.of()).stream().findFirst().orElse(null));
        claims.put("department", validated.attributes().getOrDefault("department", List.of()).stream().findFirst().orElse(null));
        claims.put("roles", validated.attributes().getOrDefault("roles", List.of()));
        return mapClaims(workspaceId, "saml2", claims);
    }

    public String getRegistrationId(UUID workspaceId, String provider) {
        return getRegistrationId(requireConfiguration(workspaceId), provider);
    }

    public String getRegistrationId(UUID workspaceId) {
        return getRegistrationId(requireConfiguration(workspaceId));
    }

    public String getRegistrationId(SsoConfiguration config) {
        return getRegistrationId(config, config.getProvider());
    }

    public Optional<SsoConfiguration> findByRegistrationId(String registrationId) {
        return ssoConfigurationRepository.findAll().stream()
                .filter(config -> registrationId.equals(getRegistrationId(config, config.getProvider())))
                .findFirst();
    }

    private void updateEnabledState(UUID workspaceId, boolean enabled) {
        ssoConfigurationRepository.findByWorkspaceId(workspaceId).ifPresent(config -> {
            config.setEnabled(enabled);
            config.setUpdatedAt(Instant.now());
            ssoConfigurationRepository.save(config);
            log.info("SSO {} for workspace={}", enabled ? "enabled" : "disabled", workspaceId);
        });
    }

    private SsoConfiguration requireConfiguration(UUID workspaceId) {
        return ssoConfigurationRepository.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("No SSO configuration found for workspace " + workspaceId));
    }

    private void validateRequest(SsoConfigurationRequest request) {
        if (!StringUtils.hasText(request.getIdpMetadataXml())) {
            throw new IllegalArgumentException("IdP metadata XML is required");
        }
        if (!StringUtils.hasText(request.getEmailAttribute())) {
            throw new IllegalArgumentException("emailAttribute is required");
        }
        if ("saml2".equalsIgnoreCase(request.getProvider()) && !StringUtils.hasText(request.getEntityId())) {
            throw new IllegalArgumentException("entityId is required for SAML2");
        }
        if ("saml2".equalsIgnoreCase(request.getProvider()) && !StringUtils.hasText(request.getAcsUrl())) {
            throw new IllegalArgumentException("acsUrl is required for SAML2");
        }
        if ("oidc".equalsIgnoreCase(request.getProvider()) && !StringUtils.hasText(request.getOidcIssuerUrl())) {
            throw new IllegalArgumentException("oidcIssuerUrl is required for OIDC");
        }
    }

    private String serializeAttributeMapping(SsoConfigurationRequest request) {
        Map<String, String> mapping = new LinkedHashMap<>();
        mapping.put("email", trimToNull(request.getEmailAttribute()));
        mapping.put("role", trimToNull(request.getRoleAttribute()));
        mapping.put("department", trimToNull(request.getDepartmentAttribute()));
        mapping.put("groups", trimToNull(request.getGroupsAttribute()));
        try {
            return objectMapper.writeValueAsString(mapping);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Unable to serialize attribute mapping", ex);
        }
    }

    private SsoConfigurationResponse toResponse(SsoConfiguration config) {
        SsoLoginUrls loginUrls = buildLoginUrls(config, "");
        Map<String, String> mapping = readAttributeMapping(config.getAttributeMappingJson());
        SsoConfigurationResponse response = new SsoConfigurationResponse();
        response.setId(config.getId());
        response.setWorkspaceId(config.getWorkspaceId());
        response.setProvider(config.getProvider());
        response.setEntityId(config.getEntityId());
        response.setAcsUrl(config.getAcsUrl());
        response.setIdpMetadataXml(config.getIdpMetadataXml());
        response.setEmailAttribute(mapping.get("email"));
        response.setRoleAttribute(mapping.get("role"));
        response.setDepartmentAttribute(mapping.get("department"));
        response.setGroupsAttribute(mapping.get("groups"));
        response.setOidcIssuerUrl(config.getOidcIssuerUrl());
        response.setOidcClientId(config.getOidcClientId());
        response.setEnabled(config.getEnabled());
        response.setSamlLoginUrl(loginUrls.samlLoginUrl());
        response.setOidcLoginUrl(loginUrls.oidcLoginUrl());
        response.setSamlRegistrationId(loginUrls.samlRegistrationId());
        response.setOidcRegistrationId(loginUrls.oidcRegistrationId());
        response.setServiceProviderMetadataXml(buildServiceProviderMetadataXml(config.getWorkspaceId()));
        response.setCreatedAt(config.getCreatedAt());
        response.setUpdatedAt(config.getUpdatedAt());
        return response;
    }

    private Map<String, String> readAttributeMapping(String attributeMappingJson) {
        if (!StringUtils.hasText(attributeMappingJson)) {
            return Map.of();
        }
        try {
            Map<?, ?> raw = objectMapper.readValue(attributeMappingJson, Map.class);
            Map<String, String> mapping = new LinkedHashMap<>();
            raw.forEach((key, value) -> mapping.put(String.valueOf(key), value == null ? null : String.valueOf(value)));
            return mapping;
        } catch (Exception ex) {
            log.warn("Unable to read SSO attribute mapping JSON", ex);
            return Map.of();
        }
    }

    private SsoConfigurationRequest toRequest(SsoConfiguration config) {
        Map<String, String> mapping = readAttributeMapping(config.getAttributeMappingJson());
        return new SsoConfigurationRequest(
                config.getWorkspaceId(),
                config.getProvider(),
                config.getEntityId(),
                config.getAcsUrl(),
                config.getIdpMetadataXml(),
                mapping.get("email"),
                mapping.get("role"),
                mapping.get("department"),
                mapping.get("groups"),
                config.getOidcIssuerUrl(),
                config.getOidcClientId(),
                config.getOidcClientSecret(),
                config.getEnabled()
        );
    }

    private String getRegistrationId(SsoConfiguration config, String provider) {
        return "workspace-" + config.getWorkspaceId() + "-" + normalizeProvider(provider);
    }

    private String normalizeProvider(String provider) {
        if (!StringUtils.hasText(provider)) {
            throw new IllegalArgumentException("provider is required");
        }
        String normalized = provider.trim().toLowerCase();
        if (!normalized.equals("saml2") && !normalized.equals("oidc")) {
            throw new IllegalArgumentException("Unsupported provider: " + provider);
        }
        return normalized;
    }

    private String required(String value, String message) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private String joinPaths(String basePath, String path) {
        if (!StringUtils.hasText(basePath)) {
            return path;
        }
        if (basePath.endsWith("/")) {
            return basePath.substring(0, basePath.length() - 1) + path;
        }
        return basePath + path;
    }
}
