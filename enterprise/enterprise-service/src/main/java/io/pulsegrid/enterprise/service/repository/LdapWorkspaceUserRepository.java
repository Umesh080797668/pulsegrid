package io.pulsegrid.enterprise.service.repository;

import io.pulsegrid.enterprise.domain.LdapWorkspaceUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LdapWorkspaceUserRepository extends JpaRepository<LdapWorkspaceUser, UUID> {

    Optional<LdapWorkspaceUser> findByWorkspaceIdAndUsername(UUID workspaceId, String username);

    List<LdapWorkspaceUser> findByWorkspaceId(UUID workspaceId);
}
