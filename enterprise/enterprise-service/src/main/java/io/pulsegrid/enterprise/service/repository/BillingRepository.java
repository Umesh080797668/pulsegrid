package io.pulsegrid.enterprise.service.repository;

import io.pulsegrid.enterprise.domain.Billing;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for accessing Billing records.
 */
@Repository
public interface BillingRepository extends JpaRepository<Billing, UUID> {

    /**
     * Find billing records for a specific workspace.
     */
    Page<Billing> findByWorkspaceId(UUID workspaceId, Pageable pageable);

    /**
     * Find billing records within a date range for a workspace.
     */
    @Query("""
        SELECT b FROM Billing b 
        WHERE b.workspaceId = :workspaceId 
        AND b.billingPeriodStart >= :start 
        AND b.billingPeriodEnd <= :end
        ORDER BY b.billingPeriodStart DESC
    """)
    List<Billing> findByWorkspaceIdAndDateRange(
        @Param("workspaceId") UUID workspaceId,
        @Param("start") Instant start,
        @Param("end") Instant end
    );

    /**
     * Find billing by Stripe invoice ID.
     */
    Optional<Billing> findByStripeInvoiceId(String stripeInvoiceId);

    /**
     * Find the most recent billing for a workspace.
     */
    Optional<Billing> findFirstByWorkspaceIdOrderByBillingPeriodEndDesc(UUID workspaceId);

    /**
     * Find all unpaid invoices for a workspace.
     */
    List<Billing> findByWorkspaceIdAndStatusIn(UUID workspaceId, List<String> statuses);

    /**
     * Find invoices due soon for reminders.
     */
    @Query("""
        SELECT b FROM Billing b 
        WHERE b.status IN ('open', 'draft') 
        AND b.dueDate <= :dueDate
        AND b.workspaceId = :workspaceId
    """)
    List<Billing> findDueSoonInvoices(
        @Param("workspaceId") UUID workspaceId,
        @Param("dueDate") Instant dueDate
    );
}
