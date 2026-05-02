package io.pulsegrid.enterprise.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

/**
 * Tracks LDAP synchronization history for audit and troubleshooting.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "enterprise_ldap_sync_history", indexes = {
    @Index(name = "idx_ldap_sync_workspace_id", columnList = "workspace_id"),
    @Index(name = "idx_ldap_sync_sync_at", columnList = "sync_at")
})
public class LdapSyncHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, name = "workspace_id")
    private UUID workspaceId;

    @Column(nullable = false, name = "sync_at")
    private Instant syncAt;

    @Column(nullable = false)
    private String status; // "SUCCESS", "FAILED", "PARTIAL"

    @Column(name = "users_synced")
    private Integer usersSynced;

    @Column(name = "users_created")
    private Integer usersCreated;

    @Column(name = "users_updated")
    private Integer usersUpdated;

    @Column(name = "groups_synced")
    private Integer groupsSynced;

    @Lob
    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "sync_duration_ms")
    private Long syncDurationMs;

    @Column(name = "triggered_by")
    private String triggeredBy; // "SCHEDULED", "MANUAL", "LOGIN"

    @PrePersist
    protected void onCreate() {
        if (syncAt == null) {
            syncAt = Instant.now();
        }
    }
}
