package io.pulsegrid.enterprise.service.batch;

import java.util.UUID;

public interface MasterKeyPurgeClient {
    void purge(UUID workspaceId, UUID userId);
}