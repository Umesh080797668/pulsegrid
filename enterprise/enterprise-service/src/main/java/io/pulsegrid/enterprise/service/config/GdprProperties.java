package io.pulsegrid.enterprise.service.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "gdpr")
public class GdprProperties {

    private String exportDirectory = System.getenv().getOrDefault("GDPR_EXPORT_DIRECTORY", "./data/gdpr-exports");

    private String placeholderUserEmail = System.getenv().getOrDefault("GDPR_PLACEHOLDER_USER_EMAIL", "gdpr-erased@pulsegrid.invalid");

    private String placeholderUserFullName = System.getenv().getOrDefault("GDPR_PLACEHOLDER_USER_FULL_NAME", "GDPR Erased Account");

    private String placeholderUserAvatarUrl = System.getenv().getOrDefault("GDPR_PLACEHOLDER_USER_AVATAR_URL", "");

    private String hsmEscrowPurgeUrl = System.getenv().getOrDefault("GDPR_HSM_ESCROW_PURGE_URL", "");

    private String hsmEscrowAuthToken = System.getenv().getOrDefault("GDPR_HSM_ESCROW_AUTH_TOKEN", "");
}