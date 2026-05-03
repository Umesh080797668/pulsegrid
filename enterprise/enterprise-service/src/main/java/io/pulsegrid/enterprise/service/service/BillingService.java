package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.domain.Subscription;
import io.pulsegrid.enterprise.domain.AuditEventType;
import io.pulsegrid.enterprise.service.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
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
                map.put("event_quota", 100000);
                map.put("connectors", "all");
                break;
            case "pro":
                map.put("plan", "pro");
                map.put("event_quota", 10000);
                map.put("connectors", "standard");
                break;
            default:
                map.put("plan", "free");
                map.put("event_quota", 1000);
                map.put("connectors", "basic");
                break;
        }
        return map;
    }
}
