package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.domain.Billing;
import io.pulsegrid.enterprise.domain.Subscription;
import io.pulsegrid.enterprise.domain.UsageTracking;
import io.pulsegrid.enterprise.domain.AuditEventType;
import io.pulsegrid.enterprise.service.repository.BillingRepository;
import io.pulsegrid.enterprise.service.repository.SubscriptionRepository;
import io.pulsegrid.enterprise.service.repository.UsageTrackingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for managing enterprise billing subscriptions and Stripe integration.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class BillingService {

    private final SubscriptionRepository subscriptionRepository;
    private final BillingRepository billingRepository;
    private final UsageTrackingRepository usageTrackingRepository;
    private final io.pulsegrid.enterprise.service.repository.PlanRedisRepository planRedisRepository;
    private final AuditService auditService;

    public Optional<Subscription> getSubscriptionByWorkspaceId(UUID workspaceId) {
        return subscriptionRepository.findByWorkspaceId(workspaceId);
    }

    public Subscription createOrUpdateSubscription(UUID workspaceId, String stripeCustomerId, String stripeSubscriptionId, String plan) {
        Subscription subscription = subscriptionRepository.findByWorkspaceId(workspaceId)
                .orElseGet(() -> new Subscription());

        java.util.Map<String, Object> beforeState = new java.util.LinkedHashMap<>();
        beforeState.put("status", subscription.getStatus() == null ? "new" : subscription.getStatus());
        beforeState.put("plan", subscription.getPlan());
        beforeState.put("stripeSubscriptionId", subscription.getStripeSubscriptionId());
        beforeState.put("stripeCustomerId", subscription.getStripeCustomerId());

        subscription.setWorkspaceId(workspaceId);
        subscription.setStripeCustomerId(stripeCustomerId);
        subscription.setStripeSubscriptionId(stripeSubscriptionId);
        subscription.setPlan(plan);
        subscription.setStatus("active");
        subscription.setCurrentPeriodStart(Instant.now());
        subscription.setCurrentPeriodEnd(Instant.now().plusSeconds(30L * 24 * 3600)); // 30 days

        Subscription saved = subscriptionRepository.save(subscription);

    auditService.recordPrivilegedAction(
        workspaceId,
        null,
        AuditEventType.PLAN_CHANGED,
        "Subscription plan changed",
        "subscription",
        workspaceId.toString(),
        beforeState,
        saved,
        "Billing subscription updated",
        null,
        null
    );

        // Write plan limits into Redis for PulseCore to read
        try {
            planRedisRepository.savePlan(workspaceId, getPlanLimits(plan));
        } catch (Exception e) {
            log.warn("Failed to write plan to Redis for workspace {}: {}", workspaceId, e.getMessage());
        }

        return saved;
    }

    public void cancelSubscription(UUID workspaceId) {
        subscriptionRepository.findByWorkspaceId(workspaceId).ifPresent(subscription -> {
            java.util.Map<String, Object> beforeState = new java.util.LinkedHashMap<>();
            beforeState.put("status", subscription.getStatus());
            beforeState.put("plan", subscription.getPlan());
            beforeState.put("stripeSubscriptionId", subscription.getStripeSubscriptionId());
            beforeState.put("stripeCustomerId", subscription.getStripeCustomerId());
            subscription.setStatus("canceled");
            subscription.setUpdatedAt(Instant.now());
            subscriptionRepository.save(subscription);
            auditService.recordPrivilegedAction(
                    workspaceId,
                    null,
                    AuditEventType.SUBSCRIPTION_CANCELLED,
                    "Subscription cancelled",
                    "subscription",
                    workspaceId.toString(),
                    beforeState,
                    subscription,
                    "Subscription canceled via enterprise billing",
                    null,
                    null
            );
            try {
                planRedisRepository.deletePlan(workspaceId);
            } catch (Exception e) {
                log.warn("Failed to delete plan from Redis for workspace {}: {}", workspaceId, e.getMessage());
            }
            log.info("Subscription canceled for workspace: {}", workspaceId);
        });
    }

    public void markSubscriptionPastDueByStripeId(String stripeSubscriptionId) {
        subscriptionRepository.findByStripeSubscriptionId(stripeSubscriptionId).ifPresent(subscription -> {
            subscription.setStatus("past_due");
            subscription.setUpdatedAt(Instant.now());
            subscriptionRepository.save(subscription);
            // mark in redis so PulseCore can act accordingly
            try {
                planRedisRepository.savePlan(subscription.getWorkspaceId(), getPlanLimits(subscription.getPlan()));
            } catch (Exception e) {
                log.warn("Failed to update plan in Redis for past_due subscription {}: {}", stripeSubscriptionId, e.getMessage());
            }
            log.info("Marked subscription past_due for workspace {}", subscription.getWorkspaceId());
        });
    }

    public void handleSubscriptionDeletedByStripeId(String stripeSubscriptionId) {
        subscriptionRepository.findByStripeSubscriptionId(stripeSubscriptionId).ifPresent(subscription -> {
            cancelSubscription(subscription.getWorkspaceId());
        });
    }

    private java.util.Map<String, Object> getPlanLimits(String plan) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        if (plan == null) plan = "free";
        switch (plan.toLowerCase()) {
            case "business":
                map.put("plan", "business");
                map.put("max_events_per_day", 2_000_000L);
                map.put("max_events_per_month", 60_000_000L);
                map.put("max_flows", 500);
                map.put("max_connectors", 100);
                map.put("max_team_members", 25);
                map.put("allowed_connector_tier", "business");
                map.put("run_history_days", 365);
                map.put("advanced_analytics", true);
                map.put("priority_support", true);
                map.put("event_quota", 2_000_000);
                map.put("connectors", "all");
                break;
            case "pro":
                map.put("plan", "pro");
                map.put("max_events_per_day", 100_000L);
                map.put("max_events_per_month", 3_000_000L);
                map.put("max_flows", 50);
                map.put("max_connectors", 10);
                map.put("max_team_members", 3);
                map.put("allowed_connector_tier", "pro");
                map.put("run_history_days", 90);
                map.put("advanced_analytics", false);
                map.put("priority_support", false);
                map.put("event_quota", 100_000);
                map.put("connectors", "standard");
                break;
            default:
                map.put("plan", "free");
                map.put("max_events_per_day", 1_000L);
                map.put("max_events_per_month", 30_000L);
                map.put("max_flows", 5);
                map.put("max_connectors", 3);
                map.put("max_team_members", 1);
                map.put("allowed_connector_tier", "free");
                map.put("run_history_days", 7);
                map.put("advanced_analytics", false);
                map.put("priority_support", false);
                map.put("event_quota", 1000);
                map.put("connectors", "basic");
                break;
        }
        return map;
    }

    /**
     * Get all billings for a workspace with pagination.
     */
    public Page<Billing> getBillingHistory(UUID workspaceId, Pageable pageable) {
        return billingRepository.findByWorkspaceId(workspaceId, pageable);
    }

    /**
     * Get the current month's usage tracking for a workspace.
     */
    public UsageTracking getOrCreateCurrentMonthUsage(UUID workspaceId) {
        String billingMonth = YearMonth.now().toString();
        return usageTrackingRepository.findByWorkspaceIdAndBillingMonth(workspaceId, billingMonth)
            .orElseGet(() -> {
                UsageTracking tracking = UsageTracking.builder()
                    .workspaceId(workspaceId)
                    .billingMonth(billingMonth)
                    .eventCount(0L)
                    .apiCallCount(0L)
                    .flowRunCount(0L)
                    .executionTimeMs(0L)
                    .build();
                return usageTrackingRepository.save(tracking);
            });
    }

    /**
     * Record usage metrics when flows execute.
     * Called by the engine or via webhook from PulseCore.
     */
    public void recordFlowExecutionUsage(UUID workspaceId, long eventCount, long apiCallCount, long executionTimeMs) {
        UsageTracking tracking = getOrCreateCurrentMonthUsage(workspaceId);
        tracking.incrementEventCount(eventCount);
        tracking.incrementApiCallCount(apiCallCount);
        tracking.incrementFlowRunCount(1);
        tracking.addExecutionTime(executionTimeMs);
        usageTrackingRepository.save(tracking);
    }

    /**
     * Check if workspace has exceeded usage limits based on current plan.
     */
    public boolean isWorkspaceOverLimit(UUID workspaceId) {
        Optional<Subscription> subscription = subscriptionRepository.findByWorkspaceId(workspaceId);
        if (subscription.isEmpty()) {
            return true; // No active subscription = over limit
        }

        String plan = subscription.get().getPlan();
        UsageTracking usage = getOrCreateCurrentMonthUsage(workspaceId);

        long monthlyEventLimit = getMonthlyEventLimit(plan);
        return usage.getEventCount() != null && usage.getEventCount() >= monthlyEventLimit;
    }

    /**
     * Create a billing invoice for a workspace based on monthly usage.
     */
    public Optional<Billing> createMonthlyInvoice(UUID workspaceId, String stripeInvoiceId) {
        Optional<Subscription> subscription = subscriptionRepository.findByWorkspaceId(workspaceId);
        if (subscription.isEmpty()) {
            log.warn("Cannot create invoice for workspace {} - no active subscription", workspaceId);
            return Optional.empty();
        }

        UsageTracking usage = getOrCreateCurrentMonthUsage(workspaceId);
        String plan = subscription.get().getPlan();

        BigDecimal baseAmount = getBasePlanPrice(plan);
        BigDecimal usageAmount = calculateUsageCharges(plan, usage);
        BigDecimal totalAmount = baseAmount.add(usageAmount);

        YearMonth currentMonth = YearMonth.now();
        Instant periodStart = currentMonth.atDay(1).atStartOfDay().toInstant(java.time.ZoneOffset.UTC);
        Instant periodEnd = currentMonth.plusMonths(1).atDay(1).atStartOfDay().toInstant(java.time.ZoneOffset.UTC);

        Billing billing = Billing.builder()
            .workspaceId(workspaceId)
            .subscriptionId(subscription.get().getId())
            .stripeInvoiceId(stripeInvoiceId)
            .billingPeriodStart(periodStart)
            .billingPeriodEnd(periodEnd)
            .baseAmount(baseAmount)
            .usageAmount(usageAmount)
            .totalAmount(totalAmount)
            .currency("USD")
            .status("open")
            .dueDate(periodEnd.plusSeconds(14 * 24 * 3600)) // 14 days payment terms
            .build();

        Billing saved = billingRepository.save(billing);
        log.info("Created billing invoice {} for workspace {} with total ${}", stripeInvoiceId, workspaceId, totalAmount);
        return Optional.of(saved);
    }

    /**
     * Mark a billing invoice as paid.
     */
    public void markBillingAsPaid(String stripeInvoiceId, Instant paidAt) {
        billingRepository.findByStripeInvoiceId(stripeInvoiceId).ifPresent(billing -> {
            billing.setStatus("paid");
            billing.setPaidAt(paidAt != null ? paidAt : Instant.now());
            billingRepository.save(billing);
            log.info("Marked invoice {} as paid for workspace {}", stripeInvoiceId, billing.getWorkspaceId());
        });
    }

    /**
     * Get the base price for a plan (in USD cents, converted to dollars).
     */
    private BigDecimal getBasePlanPrice(String plan) {
        return switch (plan != null ? plan.toLowerCase() : "free") {
            case "business" -> new BigDecimal("499.00"); // $499/month
            case "pro" -> new BigDecimal("99.00");        // $99/month
            default -> BigDecimal.ZERO;                    // free tier
        };
    }

    /**
     * Get the monthly event limit for a plan.
     */
    private long getMonthlyEventLimit(String plan) {
        return switch (plan != null ? plan.toLowerCase() : "free") {
            case "business" -> 60_000_000L;
            case "pro" -> 3_000_000L;
            default -> 30_000L;
        };
    }

    /**
     * Calculate overage charges based on usage and plan.
     */
    private BigDecimal calculateUsageCharges(String plan, UsageTracking usage) {
        if (usage.getEventCount() == null || usage.getEventCount() == 0) {
            return BigDecimal.ZERO;
        }

        long monthlyLimit = getMonthlyEventLimit(plan);
        long overageEvents = Math.max(0, usage.getEventCount() - monthlyLimit);

        // $0.50 per 100,000 additional events
        if (overageEvents > 0) {
            BigDecimal overageCost = new BigDecimal(overageEvents)
                .divide(new BigDecimal(100_000), 2, java.math.RoundingMode.HALF_UP)
                .multiply(new BigDecimal("0.50"));
            return overageCost;
        }

        return BigDecimal.ZERO;
    }
}
