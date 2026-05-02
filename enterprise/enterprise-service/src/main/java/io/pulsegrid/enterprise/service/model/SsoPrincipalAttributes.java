package io.pulsegrid.enterprise.service.model;

import java.util.List;
import java.util.UUID;

public record SsoPrincipalAttributes(
        UUID workspaceId,
        String provider,
        String subject,
        String email,
        List<String> roles,
        String department
) {
}
