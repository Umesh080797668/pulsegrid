package io.pulsegrid.enterprise.service.controller;

import io.pulsegrid.enterprise.domain.SsoConfiguration;
import io.pulsegrid.enterprise.service.dto.SsoConfigurationRequest;
import io.pulsegrid.enterprise.service.service.SsoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/sso")
@RequiredArgsConstructor
public class SsoController {

    private final SsoService ssoService;

    @GetMapping("/config/{workspaceId}")
    public ResponseEntity<?> getSsoConfiguration(@PathVariable UUID workspaceId) {
        return ssoService.getSsoConfiguration(workspaceId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/config")
    public ResponseEntity<SsoConfiguration> createOrUpdateSsoConfiguration(@Valid @RequestBody SsoConfigurationRequest request) {
        SsoConfiguration config = ssoService.createOrUpdateSsoConfiguration(
                request.getWorkspaceId(),
                request.getProvider(),
                request.getMetadata()
        );
        return ResponseEntity.ok(config);
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
}
