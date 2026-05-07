package io.pulsegrid.enterprise.service.repository;

import io.pulsegrid.enterprise.domain.UsageTracking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for accessing UsageTracking records.
 */
@Repository
public interface UsageTrackingRepository extends JpaRepository<UsageTracking, UUID> {

    /**
     * Find usage tracking for a specific workspace and billing month.
     */
    Optional<UsageTracking> findByWorkspaceIdAndBillingMonth(UUID workspaceId, String billingMonth);

    /**
     * Check if usage for a workspace in a given month exceeds threshold.
     */
    @Query("""
        SELECT ut FROM UsageTracking ut 
        WHERE ut.workspaceId = :workspaceId 
        AND ut.billingMonth = :billingMonth
    """)
    Optional<UsageTracking> getCurrentMonthUsage(
        @Param("workspaceId") UUID workspaceId,
        @Param("billingMonth") String billingMonth
    );
}
