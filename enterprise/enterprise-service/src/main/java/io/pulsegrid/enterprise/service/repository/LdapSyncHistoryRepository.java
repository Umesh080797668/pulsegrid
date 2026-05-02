package io.pulsegrid.enterprise.service.repository;

import io.pulsegrid.enterprise.domain.LdapSyncHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface LdapSyncHistoryRepository extends JpaRepository<LdapSyncHistory, UUID> {
    List<LdapSyncHistory> findByWorkspaceIdOrderBySyncAtDesc(UUID workspaceId);
    
    List<LdapSyncHistory> findByWorkspaceIdAndSyncAtAfter(UUID workspaceId, Instant since);
}
