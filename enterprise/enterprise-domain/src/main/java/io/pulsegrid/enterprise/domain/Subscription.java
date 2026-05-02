package io.pulsegrid.enterprise.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

/**
 * Represents a subscription/billing record for an enterprise workspace.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "enterprise_subscriptions")
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, name = "workspace_id")
    private UUID workspaceId;

    @Column(nullable = false, name = "stripe_customer_id")
    private String stripeCustomerId;

    @Column(nullable = false, name = "stripe_subscription_id")
    private String stripeSubscriptionId;

    @Column(nullable = false)
    private String plan;

    @Column(nullable = false, name = "status")
    private String status;

    @Column(name = "current_period_start")
    private Instant currentPeriodStart;

    @Column(name = "current_period_end")
    private Instant currentPeriodEnd;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
