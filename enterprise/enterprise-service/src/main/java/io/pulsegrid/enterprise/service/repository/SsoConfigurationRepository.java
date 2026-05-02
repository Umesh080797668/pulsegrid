package io.pulsegrid.enterprise.service.repository;

import io.pulsegrid.enterprise.domain.SsoConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface SsoConfigurationRepository extends JpaRepository<SsoConfiguration, UUID> {
    Optional<SsoConfiguration> findByWorkspaceId(UUID workspaceId);
}
