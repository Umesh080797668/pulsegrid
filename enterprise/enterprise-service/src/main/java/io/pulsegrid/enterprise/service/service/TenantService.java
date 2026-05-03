package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.service.tenancy.TenantContext;
import io.pulsegrid.enterprise.service.config.FlywayConfiguration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

/**
 * Service for managing multi-tenant schemas.
 * Handles schema creation, migrations, and cleanup for enterprise customers.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TenantService {

    private final DataSource dataSource;

    /**
     * Creates a new schema for an enterprise tenant.
     * @param tenantId the workspace UUID
     * @throws TenantManagementException if schema creation fails
     */
    @Transactional
    public void createTenantSchema(UUID tenantId) {
        String schemaName = TenantContext.generateEnterpriseSchemaName(tenantId);

        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {

            // Check if schema already exists
            String checkSchema = "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '" + schemaName + "')";
            var result = statement.executeQuery(checkSchema);
            if (result.next() && result.getBoolean(1)) {
                log.warn("Schema already exists for tenant: {}", tenantId);
                return;
            }

            // Create schema
            String createSchema = "CREATE SCHEMA IF NOT EXISTS " + schemaName;
            statement.execute(createSchema);
            log.info("Created schema for tenant: {} - schema: {}", tenantId, schemaName);

            // Set permissions (owner gets all privileges)
            String grantPermissions = "GRANT ALL PRIVILEGES ON SCHEMA " + schemaName + " TO postgres";
            statement.execute(grantPermissions);

        } catch (SQLException e) {
            log.error("Failed to create schema for tenant: {}", tenantId, e);
            throw new TenantManagementException("Failed to create schema for tenant: " + tenantId, e);
        }
    }

    /**
     * Deletes the schema for an enterprise tenant.
     * @param tenantId the workspace UUID
     * @throws TenantManagementException if schema deletion fails
     */
    @Transactional
    public void deleteTenantSchema(UUID tenantId) {
        String schemaName = TenantContext.generateEnterpriseSchemaName(tenantId);

        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {

            // Drop schema with cascade
            String dropSchema = "DROP SCHEMA IF EXISTS " + schemaName + " CASCADE";
            statement.execute(dropSchema);
            log.info("Deleted schema for tenant: {} - schema: {}", tenantId, schemaName);

        } catch (SQLException e) {
            log.error("Failed to delete schema for tenant: {}", tenantId, e);
            throw new TenantManagementException("Failed to delete schema for tenant: " + tenantId, e);
        }
    }
    
    /**
     * Creates a new schema for an enterprise tenant and applies tenant-specific migrations.
     * This is called during workspace upgrade to ENTERPRISE plan.
     * @param tenantId the workspace UUID
     * @throws TenantManagementException if schema creation or migration fails
     */
    @Transactional
    public void createTenantSchemaWithMigrations(UUID tenantId) {
        createTenantSchema(tenantId);

        // Apply tenant-specific migrations
        String schemaName = TenantContext.generateEnterpriseSchemaName(tenantId);
        try {
            Flyway tenantFlyway = FlywayConfiguration.createTenantFlyway(dataSource, schemaName);
            int migrationsApplied = tenantFlyway.migrate().migrationsExecuted;
            log.info("Applied {} migrations for tenant: {} in schema: {}", migrationsApplied, tenantId, schemaName);
        } catch (Exception e) {
            log.error("Failed to apply migrations for tenant: {}", tenantId, e);
            throw new TenantManagementException("Failed to apply migrations for tenant: " + tenantId, e);
        }
    }


    /**
     * Checks if a schema exists for the given tenant.
     * @param tenantId the workspace UUID
     * @return true if schema exists, false otherwise
     */
    public boolean schemaExists(UUID tenantId) {
        String schemaName = TenantContext.generateEnterpriseSchemaName(tenantId);

        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {

            String checkSchema = "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '" + schemaName + "')";
            var result = statement.executeQuery(checkSchema);
            if (result.next()) {
                return result.getBoolean(1);
            }

        } catch (SQLException e) {
            log.error("Failed to check if schema exists for tenant: {}", tenantId, e);
        }

        return false;
    }

    /**
     * Gets the size of a tenant's schema.
     * @param tenantId the workspace UUID
     * @return size in bytes
     */
    public long getSchemaSize(UUID tenantId) {
        String schemaName = TenantContext.generateEnterpriseSchemaName(tenantId);

        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {

            String sizeQuery = "SELECT pg_schema_size('" + schemaName + "')";
            var result = statement.executeQuery(sizeQuery);
            if (result.next()) {
                return result.getLong(1);
            }

        } catch (SQLException e) {
            log.error("Failed to get schema size for tenant: {}", tenantId, e);
        }

        return 0;
    }

    /**
     * Executes a raw SQL statement in a tenant's schema.
     * Used for manual tenant-specific operations.
     * @param tenantId the workspace UUID
     * @param sql the SQL statement
     */
    @Transactional
    public void executeTenantQuery(UUID tenantId, String sql) {
        String schemaName = TenantContext.generateEnterpriseSchemaName(tenantId);

        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {

            statement.execute("SET search_path TO " + schemaName);
            statement.execute(sql);
            log.debug("Executed query for tenant: {} in schema: {}", tenantId, schemaName);

        } catch (SQLException e) {
            log.error("Failed to execute query for tenant: {}", tenantId, e);
            throw new TenantManagementException("Failed to execute query for tenant: " + tenantId, e);
        }
    }
}
