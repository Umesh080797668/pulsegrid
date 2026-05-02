package io.pulsegrid.enterprise.service.controller;

import io.pulsegrid.enterprise.service.dto.LdapConfigurationRequest;
import io.pulsegrid.enterprise.service.dto.LdapConfigurationResponse;
import io.pulsegrid.enterprise.service.dto.LdapSyncHistoryResponse;
import io.pulsegrid.enterprise.service.service.LdapService;
import io.pulsegrid.enterprise.service.service.LdapSyncScheduler;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * REST endpoints for LDAP/Active Directory configuration and management.
 * Requires enterprise admin authentication.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/enterprise/ldap")
@RequiredArgsConstructor
@CrossOrigin(origins = "${enterprise.admin.allowed-origin:http://localhost:4200}")
public class LdapController {

    private final LdapService ldapService;
    private final LdapSyncScheduler ldapSyncScheduler;

    /**
     * Get LDAP configuration for a workspace
     */
    @GetMapping("/config/{workspaceId}")
    public ResponseEntity<LdapConfigurationResponse> getLdapConfiguration(@PathVariable UUID workspaceId) {
        log.info("Fetching LDAP configuration for workspace: {}", workspaceId);
        return ldapService.getLdapConfiguration(workspaceId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Create or update LDAP configuration
     */
    @PutMapping("/config")
    public ResponseEntity<LdapConfigurationResponse> createOrUpdateLdapConfiguration(
            @Valid @RequestBody LdapConfigurationRequest request) {
        log.info("Creating/updating LDAP configuration for workspace: {}", request.getWorkspaceId());
        try {
            LdapConfigurationResponse response = ldapService.createOrUpdateLdapConfiguration(request);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            log.error("Invalid LDAP configuration: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Test LDAP connection and bind credentials
     */
    @PostMapping("/config/{workspaceId}/test")
    public ResponseEntity<Void> testLdapConnection(@PathVariable UUID workspaceId) {
        log.info("Testing LDAP connection for workspace: {}", workspaceId);
        boolean success = ldapService.testLdapConnection(workspaceId);
        return success ? ResponseEntity.ok().build() : ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }

    /**
     * Delete LDAP configuration
     */
    @DeleteMapping("/config/{workspaceId}")
    public ResponseEntity<Void> deleteLdapConfiguration(@PathVariable UUID workspaceId) {
        log.info("Deleting LDAP configuration for workspace: {}", workspaceId);
        ldapService.deleteLdapConfiguration(workspaceId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Trigger manual sync
     */
    @PostMapping("/config/{workspaceId}/sync")
    public ResponseEntity<Void> triggerManualSync(@PathVariable UUID workspaceId) {
        log.info("Triggering manual LDAP sync for workspace: {}", workspaceId);
        try {
            ldapSyncScheduler.triggerManualSync(workspaceId);
            return ResponseEntity.accepted().build();
        } catch (Exception e) {
            log.error("Error triggering manual sync: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get sync history for a workspace
     */
    @GetMapping("/config/{workspaceId}/sync-history")
    public ResponseEntity<List<LdapSyncHistoryResponse>> getSyncHistory(
            @PathVariable UUID workspaceId,
            @RequestParam(defaultValue = "10") int limit) {
        log.info("Fetching LDAP sync history for workspace: {} (limit: {})", workspaceId, limit);
        List<LdapSyncHistoryResponse> history = ldapService.getSyncHistory(workspaceId, limit);
        return ResponseEntity.ok(history);
    }
}
