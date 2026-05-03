package io.pulsegrid.enterprise.service.config;

import io.pulsegrid.enterprise.service.tenancy.hibernate.SchemaBasedMultiTenantConnectionProvider;
import io.pulsegrid.enterprise.service.tenancy.hibernate.PulseGridTenantIdentifierResolver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

/**
 * Hibernate configuration for multi-tenant schema-per-tenant isolation.
 * Configures Hibernate to use schema-based multi-tenancy with custom connection provider
 * and tenant identifier resolver.
 */
@Configuration
public class HibernateConfiguration {

    /**
     * Configure EntityManagerFactory with multi-tenancy settings.
     */
    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(
            DataSource dataSource,
            SchemaBasedMultiTenantConnectionProvider connectionProvider,
            PulseGridTenantIdentifierResolver tenantIdentifierResolver,
            @Value("${spring.jpa.hibernate.ddl-auto:validate}") String ddlAuto) {

        LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
        emf.setDataSource(dataSource);
        emf.setPackagesToScan("io.pulsegrid.enterprise.domain");
        emf.setJpaVendorAdapter(new HibernateJpaVendorAdapter());

        // Configure Hibernate properties for multi-tenancy
        Map<String, Object> properties = new HashMap<>();

        // Enable multi-tenancy with schema strategy
        properties.put("hibernate.multiTenancy", "SCHEMA");
        properties.put("hibernate.multi_tenant_connection_provider", connectionProvider);
        properties.put("hibernate.tenant_identifier_resolver", tenantIdentifierResolver);

        // Database dialect
        properties.put("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect");

        // Connection pooling
        properties.put("hibernate.c3p0.min_size", 5);
        properties.put("hibernate.c3p0.max_size", 20);
        properties.put("hibernate.c3p0.max_statements", 0);

        // Behavior settings
        properties.put("hibernate.format_sql", true);
        properties.put("hibernate.use_sql_comments", true);
        properties.put("hibernate.jdbc.batch_size", 20);
        properties.put("hibernate.order_inserts", true);
        properties.put("hibernate.order_updates", true);

        // Schema generation is controlled per environment.
        properties.put("hibernate.hbm2ddl.auto", ddlAuto);

        emf.setJpaPropertyMap(properties);

        return emf;
    }
}
