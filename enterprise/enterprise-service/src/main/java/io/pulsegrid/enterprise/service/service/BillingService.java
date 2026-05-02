package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.domain.Subscription;
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

    public Optional<Subscription> getSubscriptionByWorkspaceId(UUID workspaceId) {
        return subscriptionRepository.findByWorkspaceId(workspaceId);
    }

    public Subscription createOrUpdateSubscription(UUID workspaceId, String stripeCustomerId, String stripeSubscriptionId, String plan) {
        Subscription subscription = subscriptionRepository.findByWorkspaceId(workspaceId)
                .orElseGet(() -> new Subscription());

        subscription.setWorkspaceId(workspaceId);
        subscription.setStripeCustomerId(stripeCustomerId);
        subscription.setStripeSubscriptionId(stripeSubscriptionId);
        subscription.setPlan(plan);
        subscription.setStatus("active");
        subscription.setCurrentPeriodStart(Instant.now());
        subscription.setCurrentPeriodEnd(Instant.now().plusSeconds(30L * 24 * 3600)); // 30 days

        return subscriptionRepository.save(subscription);
    }

    public void cancelSubscription(UUID workspaceId) {
        subscriptionRepository.findByWorkspaceId(workspaceId).ifPresent(subscription -> {
            subscription.setStatus("canceled");
            subscription.setUpdatedAt(Instant.now());
            subscriptionRepository.save(subscription);
            log.info("Subscription canceled for workspace: {}", workspaceId);
        });
    }
}
