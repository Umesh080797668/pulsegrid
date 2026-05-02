package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.domain.LdapConfiguration;
import io.pulsegrid.enterprise.service.repository.LdapConfigurationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Scheduled LDAP synchronization job.
 * Runs periodically to sync users and groups from LDAP.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LdapSyncScheduler {

    private final LdapConfigurationRepository ldapConfigRepository;
    private final LdapService ldapService;

    /**
     * Run LDAP sync job every 5 minutes.
     * Individual workspace sync intervals are configured separately.
     */
    @Scheduled(fixedDelay = 300000, initialDelay = 60000) // 5 minutes, 1 minute initial delay
    public void runLdapSyncJob() {
        log.debug("Starting scheduled LDAP sync job");

        ldapConfigRepository.findAll().stream()
                .filter(LdapConfiguration::getEnabled)
                .forEach(this::syncIfDue);

        log.debug("Completed scheduled LDAP sync job");
    }

    /**
     * Manually trigger sync for a specific workspace
     */
    public void triggerManualSync(java.util.UUID workspaceId) {
        log.info("Triggering manual LDAP sync for workspace: {}", workspaceId);
        ldapService.syncLdapUsers(workspaceId, "MANUAL");
    }

    // Private helper methods

    private void syncIfDue(LdapConfiguration config) {
        Instant now = Instant.now();
        Instant nextSyncTime = calculateNextSyncTime(config);

        if (now.isAfter(nextSyncTime)) {
            try {
                log.info("Running LDAP sync for workspace: {} (interval: {} minutes)",
                        config.getWorkspaceId(), config.getSyncIntervalMinutes());
                ldapService.syncLdapUsers(config.getWorkspaceId(), "SCHEDULED");
            } catch (Exception e) {
                log.error("Error running LDAP sync for workspace: {}", config.getWorkspaceId(), e);
            }
        } else {
            log.debug("Skipping LDAP sync for workspace: {} (next sync at: {})",
                    config.getWorkspaceId(), nextSyncTime);
        }
    }

    private Instant calculateNextSyncTime(LdapConfiguration config) {
        if (config.getLastSyncAt() == null) {
            // Never synced before, sync immediately
            return Instant.now().minusSeconds(1);
        }

        long intervalMinutes = config.getSyncIntervalMinutes() != null ? config.getSyncIntervalMinutes() : 60;
        return config.getLastSyncAt().plus(intervalMinutes, ChronoUnit.MINUTES);
    }
}
