package io.pulsegrid.enterprise.service.batch;

import io.pulsegrid.enterprise.service.config.GdprProperties;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class HttpHsmEscrowMasterKeyPurgeClient implements MasterKeyPurgeClient {

    private final GdprProperties gdprProperties;

    public HttpHsmEscrowMasterKeyPurgeClient(GdprProperties gdprProperties) {
        this.gdprProperties = gdprProperties;
    }

    @Override
    public void purge(UUID workspaceId, UUID userId) {
        String purgeUrl = gdprProperties.getHsmEscrowPurgeUrl();
        if (purgeUrl == null || purgeUrl.isBlank()) {
            throw new IllegalStateException("gdpr.hsm-escrow-purge-url must be configured to purge the master key");
        }

        RestTemplate restTemplate = new RestTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (gdprProperties.getHsmEscrowAuthToken() != null && !gdprProperties.getHsmEscrowAuthToken().isBlank()) {
            headers.setBearerAuth(gdprProperties.getHsmEscrowAuthToken().trim());
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("workspaceId", workspaceId.toString());
        payload.put("userId", userId.toString());
        payload.put("requestedAt", Instant.now().toString());

        restTemplate.postForEntity(purgeUrl, new HttpEntity<>(payload, headers), Void.class);
    }
}