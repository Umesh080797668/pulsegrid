package io.pulsegrid.enterprise.service.repository;

import io.pulsegrid.enterprise.domain.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {
    List<AuditLog> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    @Query("SELECT al FROM AuditLog al WHERE al.workspaceId = :workspaceId AND al.createdAt >= :since ORDER BY al.createdAt DESC")
    List<AuditLog> findAuditLogsSince(@Param("workspaceId") UUID workspaceId, @Param("since") Instant since);

    List<AuditLog> findByWorkspaceIdAndUserIdOrderByCreatedAtDesc(UUID workspaceId, UUID userId);
}
