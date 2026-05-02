package io.pulsegrid.enterprise.service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "stripe.api")
public class StripeConfiguration {
    private String key;
}
