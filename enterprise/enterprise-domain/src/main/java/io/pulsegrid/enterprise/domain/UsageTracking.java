package io.pulsegrid.enterprise.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

/**
 * Tracks real-time usage metrics per workspace for billing and plan enforcement.
 * Updated by PulseCore when flows execute.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "enterprise_usage_tracking", indexes = {
    @Index(name = "idx_usage_workspace", columnList = "workspace_id"),
    @Index(name = "idx_usage_month", columnList = "billing_month")
})
public class UsageTracking {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, name = "workspace_id")
    private UUID workspaceId;

    @Column(nullable = false, name = "billing_month")
    private String billingMonth; // YYYY-MM format

    @Column(nullable = false, name = "event_count")
    @Builder.Default
    private Long eventCount = 0L;

    @Column(nullable = false, name = "api_call_count")
    @Builder.Default
    private Long apiCallCount = 0L;

    @Column(nullable = false, name = "flow_run_count")
    @Builder.Default
    private Long flowRunCount = 0L;

    @Column(nullable = false, name = "execution_time_ms")
    @Builder.Default
    private Long executionTimeMs = 0L;

    @Column(name = "connector_calls_by_type")
    private String connectorCallsJson; // JSON: {"slack": 100, "github": 50}

    @Column(nullable = false, name = "created_at", updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(nullable = false, name = "updated_at")
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /**
     * Increment event count for this usage tracking record.
     */
    public void incrementEventCount(long count) {
        this.eventCount = (this.eventCount != null ? this.eventCount : 0) + count;
        this.updatedAt = Instant.now();
    }

    /**
     * Increment API call count.
     */
    public void incrementApiCallCount(long count) {
        this.apiCallCount = (this.apiCallCount != null ? this.apiCallCount : 0) + count;
        this.updatedAt = Instant.now();
    }

    /**
     * Increment flow run count.
     */
    public void incrementFlowRunCount(long count) {
        this.flowRunCount = (this.flowRunCount != null ? this.flowRunCount : 0) + count;
        this.updatedAt = Instant.now();
    }

    /**
     * Add execution time (in milliseconds).
     */
    public void addExecutionTime(long timeMs) {
        this.executionTimeMs = (this.executionTimeMs != null ? this.executionTimeMs : 0) + timeMs;
        this.updatedAt = Instant.now();
    }
}
