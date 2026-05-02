package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.domain.SsoConfiguration;
import io.pulsegrid.enterprise.service.repository.SsoConfigurationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for managing SSO configurations (SAML 2.0, OIDC, LDAP).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class SsoService {

    private final SsoConfigurationRepository ssoConfigurationRepository;

    public Optional<SsoConfiguration> getSsoConfiguration(UUID workspaceId) {
        return ssoConfigurationRepository.findByWorkspaceId(workspaceId);
    }

    public SsoConfiguration createOrUpdateSsoConfiguration(UUID workspaceId, String provider, String metadata) {
        SsoConfiguration config = ssoConfigurationRepository.findByWorkspaceId(workspaceId)
                .orElseGet(() -> new SsoConfiguration());

        config.setWorkspaceId(workspaceId);
        config.setProvider(provider);
        config.setMetadata(metadata);
        config.setUpdatedAt(Instant.now());

        SsoConfiguration saved = ssoConfigurationRepository.save(config);
        log.info("SSO configuration updated for workspace: {}, provider: {}", workspaceId, provider);
        return saved;
    }

    public void enableSso(UUID workspaceId) {
        ssoConfigurationRepository.findByWorkspaceId(workspaceId).ifPresent(config -> {
            config.setEnabled(true);
            config.setUpdatedAt(Instant.now());
            ssoConfigurationRepository.save(config);
            log.info("SSO enabled for workspace: {}", workspaceId);
        });
    }

    public void disableSso(UUID workspaceId) {
        ssoConfigurationRepository.findByWorkspaceId(workspaceId).ifPresent(config -> {
            config.setEnabled(false);
            config.setUpdatedAt(Instant.now());
            ssoConfigurationRepository.save(config);
            log.info("SSO disabled for workspace: {}", workspaceId);
        });
    }
}
