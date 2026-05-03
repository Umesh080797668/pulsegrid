package io.pulsegrid.enterprise.service.tenancy.hibernate;

import org.hibernate.engine.jdbc.connections.spi.AbstractMultiTenantConnectionProvider;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.springframework.stereotype.Component;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

/**
 * Custom Hibernate multi-tenant connection provider that implements schema-per-tenant isolation.
 * Routes connections to the appropriate PostgreSQL schema based on tenant ID.
 */
@Component
public class SchemaBasedMultiTenantConnectionProvider extends AbstractMultiTenantConnectionProvider<String> {

    private DataSource dataSource;

    public SchemaBasedMultiTenantConnectionProvider(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    protected ConnectionProvider getAnyConnectionProvider() {
        return new DataSourceConnectionProvider(dataSource);
    }

    @Override
    protected ConnectionProvider selectConnectionProvider(String tenantIdentifier) {
        return new DataSourceConnectionProvider(dataSource, tenantIdentifier);
    }

    /**
     * Inner class that wraps DataSource and handles schema switching.
     */
    private static class DataSourceConnectionProvider implements ConnectionProvider {

        private final DataSource dataSource;
        private final String schemaName;

        public DataSourceConnectionProvider(DataSource dataSource) {
            this.dataSource = dataSource;
            this.schemaName = null;
        }

        public DataSourceConnectionProvider(DataSource dataSource, String schemaName) {
            this.dataSource = dataSource;
            this.schemaName = schemaName;
        }

        @Override
        public Connection getConnection() throws SQLException {
            Connection connection = dataSource.getConnection();
            if (schemaName != null && !schemaName.isEmpty()) {
                try {
                    // Set the schema for PostgreSQL
                    connection.createStatement().execute("SET search_path TO " + schemaName);
                } catch (SQLException e) {
                    connection.close();
                    throw new SQLException("Failed to set schema: " + schemaName, e);
                }
            }
            return connection;
        }

        @Override
        public void closeConnection(Connection conn) throws SQLException {
            if (conn != null) {
                conn.close();
            }
        }

        @Override
        public boolean supportsAggressiveRelease() {
            return false;
        }

        @Override
        public boolean isUnwrappableAs(Class<?> unwrappableClass) {
            return false;
        }

        @Override
        public <T> T unwrap(Class<T> unwrappableClass) {
            return null;
        }
    }
}
