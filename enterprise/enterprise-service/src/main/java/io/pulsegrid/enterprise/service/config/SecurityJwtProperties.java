package io.pulsegrid.enterprise.service.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "security.jwt")
public class SecurityJwtProperties {

    /**
     * Signing secret for enterprise JWTs.
     */
    private String secret;

    /**
     * Token expiration in milliseconds.
     */
    private long expiration = 900000L;
}
