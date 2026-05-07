package io.pulsegrid.enterprise.service.controller;

import io.pulsegrid.enterprise.domain.Billing;
import io.pulsegrid.enterprise.domain.Subscription;
import io.pulsegrid.enterprise.domain.UsageTracking;
import io.pulsegrid.enterprise.service.dto.CreateSubscriptionRequest;
import io.pulsegrid.enterprise.service.service.BillingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/billing")
@RequiredArgsConstructor
public class BillingController {

    private final BillingService billingService;
    private final io.pulsegrid.enterprise.service.service.StripeClientService stripeClientService;

    /**
     * Get subscription for a workspace
     */
    @GetMapping("/subscription/{workspaceId}")
    public ResponseEntity<?> getSubscription(@PathVariable UUID workspaceId) {
        return billingService.getSubscriptionByWorkspaceId(workspaceId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Create or update subscription
     */
    @PostMapping("/subscription")
    public ResponseEntity<Subscription> createSubscription(@Valid @RequestBody CreateSubscriptionRequest request) {
        Subscription subscription = billingService.createOrUpdateSubscription(
                request.getWorkspaceId(),
                request.getStripeCustomerId(),
                request.getStripeSubscriptionId(),
                request.getPlan()
        );
        return ResponseEntity.ok(subscription);
    }

    /**
     * Get billing history for a workspace
     */
    @GetMapping("/history/{workspaceId}")
    public ResponseEntity<Page<Billing>> getBillingHistory(
            @PathVariable UUID workspaceId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Billing> history = billingService.getBillingHistory(workspaceId, pageable);
        return ResponseEntity.ok(history);
    }

    /**
     * Get current month usage for workspace
     */
    @GetMapping("/usage/{workspaceId}")
    public ResponseEntity<UsageTracking> getCurrentUsage(@PathVariable UUID workspaceId) {
        UsageTracking usage = billingService.getOrCreateCurrentMonthUsage(workspaceId);
        return ResponseEntity.ok(usage);
    }

    /**
     * Record flow execution usage (called by PulseCore or webhooks)
     */
    @PostMapping("/usage/{workspaceId}/record")
    public ResponseEntity<Void> recordUsage(
            @PathVariable UUID workspaceId,
            @RequestParam long eventCount,
            @RequestParam long apiCallCount,
            @RequestParam long executionTimeMs) {
        billingService.recordFlowExecutionUsage(workspaceId, eventCount, apiCallCount, executionTimeMs);
        return ResponseEntity.ok().build();
    }

    /**
     * Check if workspace is over limit
     */
    @GetMapping("/usage/{workspaceId}/over-limit")
    public ResponseEntity<Boolean> isOverLimit(@PathVariable UUID workspaceId) {
        boolean overLimit = billingService.isWorkspaceOverLimit(workspaceId);
        return ResponseEntity.ok(overLimit);
    }

    /**
     * Create Stripe customer
     */
    @PostMapping("/stripe/customer")
    public ResponseEntity<?> createStripeCustomer(@Valid @RequestBody io.pulsegrid.enterprise.service.dto.CreateStripeCustomerRequest req) {
        try {
            com.stripe.model.Customer c = stripeClientService.createCustomer(req.getEmail(), req.getName());
            return ResponseEntity.ok(c);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(e.getMessage());
        }
    }

    /**
     * Create Stripe subscription
     */
    @PostMapping("/stripe/subscribe")
    public ResponseEntity<?> createStripeSubscription(@Valid @RequestBody io.pulsegrid.enterprise.service.dto.CreateStripeSubscriptionRequest req) {
        try {
            com.stripe.model.Subscription sub = stripeClientService.createSubscriptionForWorkspace(req.getWorkspaceId(), req.getCustomerId(), req.getPriceId(), req.getPlan());
            return ResponseEntity.ok(sub);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(e.getMessage());
        }
    }

    /**
     * Cancel subscription
     */
    @DeleteMapping("/subscription/{workspaceId}")
    public ResponseEntity<Void> cancelSubscription(@PathVariable UUID workspaceId) {
        billingService.cancelSubscription(workspaceId);
        return ResponseEntity.noContent().build();
    }
}
