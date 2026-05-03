package io.pulsegrid.enterprise.service.tenancy;

import io.pulsegrid.enterprise.service.service.TenantService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Coordinates workspace upgrade actions related to tenant schema provisioning.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TenantProvisioningService {

    private final TenantService tenantService;

    public void provisionEnterpriseTenant(UUID workspaceId) {
        log.info("Provisioning enterprise schema for workspace {}", workspaceId);
        tenantService.createTenantSchemaWithMigrations(workspaceId);
    }

    public void deprovisionEnterpriseTenant(UUID workspaceId) {
        log.info("Dropping enterprise schema for workspace {}", workspaceId);
        tenantService.deleteTenantSchema(workspaceId);
    }
}