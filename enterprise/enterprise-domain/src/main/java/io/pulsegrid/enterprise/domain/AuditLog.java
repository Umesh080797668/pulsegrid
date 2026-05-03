package io.pulsegrid.enterprise.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

/**
 * Represents an immutable audit log entry for SOC 2 compliance and security tracking.
 * This table is append-only and immutable. Once created, records cannot be updated or deleted.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "enterprise_audit_logs", indexes = {
    @Index(name = "idx_workspace_id", columnList = "workspace_id"),
    @Index(name = "idx_user_id", columnList = "user_id"),
    @Index(name = "idx_event_type", columnList = "event_type"),
    @Index(name = "idx_created_at", columnList = "created_at"),
    @Index(name = "idx_workspace_created", columnList = "workspace_id,created_at")
})
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, name = "workspace_id")
    private UUID workspaceId;

    @Column(nullable = false, name = "user_id")
    private UUID userId;

    @Column(nullable = false, name = "event_type", length = 64)
    private String eventType;

    @Column(nullable = false, length = 255)
    private String action;

    @Column(name = "resource_type", length = 128)
    private String resourceType;

    @Column(name = "resource_id", length = 255)
    private String resourceId;

    @Column(columnDefinition = "jsonb")
    private String details;

    @Column(name = "before_state", columnDefinition = "jsonb")
    private String beforeState;

    @Column(name = "after_state", columnDefinition = "jsonb")
    private String afterState;

    @Column(nullable = false, length = 64)
    private String ipAddress;

    @Column(name = "user_agent", length = 1024)
    private String userAgent;

    @Column(name = "clickhouse_synced", nullable = false)
    private boolean clickhouseSynced = false;

    @Column(name = "immutable_hash", length = 128)
    private String immutableHash;

    @Column(nullable = false, name = "created_at", updatable = false)
    private Instant createdAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
    }

    @PreUpdate
    protected void onUpdate() {
        throw new UnsupportedOperationException("Audit logs are immutable and cannot be updated");
    }
}
