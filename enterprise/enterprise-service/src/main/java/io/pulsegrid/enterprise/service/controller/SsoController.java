package io.pulsegrid.enterprise.service.controller;

import io.pulsegrid.enterprise.domain.SsoConfiguration;
import io.pulsegrid.enterprise.service.dto.SsoConfigurationRequest;
import io.pulsegrid.enterprise.service.dto.SsoConfigurationResponse;
import io.pulsegrid.enterprise.service.service.SsoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/sso")
@RequiredArgsConstructor
@CrossOrigin(origins = "${enterprise.admin.allowed-origin:http://localhost:4200}")
public class SsoController {

    private final SsoService ssoService;

    @GetMapping("/config/{workspaceId}")
    public ResponseEntity<SsoConfigurationResponse> getSsoConfiguration(@PathVariable UUID workspaceId) {
        return ssoService.getSsoConfiguration(workspaceId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/config/{workspaceId}/entity")
    public ResponseEntity<SsoConfiguration> getSsoConfigurationEntity(@PathVariable UUID workspaceId) {
        return ssoService.getSsoConfigurationEntity(workspaceId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/config")
    public ResponseEntity<SsoConfigurationResponse> createOrUpdateSsoConfiguration(@Valid @RequestBody SsoConfigurationRequest request) {
        return ResponseEntity.ok(ssoService.createOrUpdateSsoConfiguration(request));
    }

    @PostMapping("/config/{workspaceId}/enable")
    public ResponseEntity<Void> enableSso(@PathVariable UUID workspaceId) {
        ssoService.enableSso(workspaceId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/config/{workspaceId}/disable")
    public ResponseEntity<Void> disableSso(@PathVariable UUID workspaceId) {
        ssoService.disableSso(workspaceId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/config/{workspaceId}/metadata")
    public ResponseEntity<Map<String, String>> getServiceProviderMetadata(@PathVariable UUID workspaceId) {
        return ResponseEntity.ok(Map.of("metadataXml", ssoService.buildServiceProviderMetadataXml(workspaceId)));
    }

    @GetMapping("/config/{workspaceId}/login-url")
    public ResponseEntity<Map<String, String>> getLoginUrl(@PathVariable UUID workspaceId, @RequestParam String provider) {
        return ResponseEntity.ok(Map.of(
                "provider", provider,
                "loginUrl", ssoService.buildLoginUrl(workspaceId, provider, ""),
                "registrationId", ssoService.getRegistrationId(workspaceId, provider)
        ));
    }

    @DeleteMapping("/config/{workspaceId}")
    public ResponseEntity<Void> deleteSsoConfiguration(@PathVariable UUID workspaceId) {
        ssoService.deleteSsoConfiguration(workspaceId);
        return ResponseEntity.noContent().build();
    }
}
