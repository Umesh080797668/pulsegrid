package io.pulsegrid.enterprise.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Billing record representing a single invoice for an enterprise workspace.
 * Tracks charges, usage metrics, and Stripe invoice references.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "enterprise_billings", indexes = {
    @Index(name = "idx_workspace_id", columnList = "workspace_id"),
    @Index(name = "idx_billing_period", columnList = "billing_period_start, billing_period_end")
})
public class Billing {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, name = "workspace_id")
    private UUID workspaceId;

    @Column(nullable = false, name = "stripe_invoice_id")
    private String stripeInvoiceId;

    @Column(nullable = false, name = "subscription_id")
    private UUID subscriptionId;

    @Column(nullable = false, name = "billing_period_start")
    private Instant billingPeriodStart;

    @Column(nullable = false, name = "billing_period_end")
    private Instant billingPeriodEnd;

    @Column(nullable = false)
    private BigDecimal baseAmount;

    @Column(nullable = false)
    private BigDecimal usageAmount;

    @Column(nullable = false)
    private BigDecimal totalAmount;

    @Column(name = "currency")
    private String currency = "USD";

    @Column(nullable = false)
    private String status; // draft, open, paid, void, uncollectible

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "due_date")
    private Instant dueDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
