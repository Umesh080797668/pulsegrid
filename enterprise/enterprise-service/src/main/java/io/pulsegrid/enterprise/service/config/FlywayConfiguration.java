package io.pulsegrid.enterprise.service.config;

import org.flywaydb.core.Flyway;
// Removed unused FlywayConfiguration and FlywayProperties imports
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import javax.sql.DataSource;
import java.util.Map;

/**
 * Configuration for Flyway database migrations in a multi-tenant environment.
 * Handles base schema migrations that apply to all tenants, and tenant-specific
 * migration scripts are applied during workspace upgrade.
 */
@Configuration
public class FlywayConfiguration {

    /**
     * Configure Flyway for shared schema migrations.
     * Migrations in db/migration are applied to the 'public' schema automatically.
     * Tenant-specific migrations in db/migration/tenant are applied on-demand.
     */
    @Bean(name = "flyway")
    @Primary
    public Flyway flyway(DataSource dataSource) {
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .locations("classpath:db/migration")
                .outOfOrder(false)
                .validateOnMigrate(true)
                .placeholderReplacement(true)
                .placeholders(Map.of("migrationVersion", "1.0.0"))
                .load();

        return flyway;
    }

    /**
     * Create a Flyway instance for tenant-specific migrations.
     * Called by TenantService during tenant provisioning.
     */
    public static Flyway createTenantFlyway(DataSource dataSource, String tenantSchema) {
        return Flyway.configure()
                .dataSource(dataSource)
                .schemas(tenantSchema)
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .locations("classpath:db/migration/tenant")
                .table("flyway_schema_history")
                .outOfOrder(false)
                .validateOnMigrate(true)
                .placeholderReplacement(true)
                .placeholders(Map.of(
                    "schema", tenantSchema,
                    "migrationVersion", "1.0.0"
                ))
                .load();
    }
}
