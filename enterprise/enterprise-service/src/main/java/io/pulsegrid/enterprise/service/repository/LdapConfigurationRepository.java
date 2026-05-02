package io.pulsegrid.enterprise.service.repository;

import io.pulsegrid.enterprise.domain.LdapConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface LdapConfigurationRepository extends JpaRepository<LdapConfiguration, UUID> {
    Optional<LdapConfiguration> findByWorkspaceId(UUID workspaceId);
}
