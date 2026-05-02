package io.pulsegrid.enterprise.service.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "stripe.api")
public class StripeApiProperties {

    /**
     * Stripe secret key used by enterprise billing.
     */
    private String key;

    /**
     * Stripe webhook signing secret.
     */
    private String webhookSecret;
}
