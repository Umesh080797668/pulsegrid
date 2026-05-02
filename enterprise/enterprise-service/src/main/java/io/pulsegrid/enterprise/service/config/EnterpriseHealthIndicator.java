package io.pulsegrid.enterprise.service.config;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * Custom Spring Actuator health indicator for enterprise service.
 */
@Component
public class EnterpriseHealthIndicator implements HealthIndicator {

    @Override
    public Health health() {
        // Check database connectivity and other dependencies
        try {
            // In production, implement actual health checks here
            return Health.up()
                    .withDetail("service", "enterprise-service")
                    .withDetail("status", "running")
                    .build();
        } catch (Exception e) {
            return Health.down()
                    .withDetail("error", e.getMessage())
                    .build();
        }
    }
}
