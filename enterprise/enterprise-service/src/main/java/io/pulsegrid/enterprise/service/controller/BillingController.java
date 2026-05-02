package io.pulsegrid.enterprise.service.controller;

import io.pulsegrid.enterprise.domain.Subscription;
import io.pulsegrid.enterprise.service.dto.CreateSubscriptionRequest;
import io.pulsegrid.enterprise.service.service.BillingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

    @GetMapping("/subscription/{workspaceId}")
    public ResponseEntity<?> getSubscription(@PathVariable UUID workspaceId) {
        return billingService.getSubscriptionByWorkspaceId(workspaceId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

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

    @PostMapping("/stripe/customer")
    public ResponseEntity<?> createStripeCustomer(@Valid @RequestBody io.pulsegrid.enterprise.service.dto.CreateStripeCustomerRequest req) {
        try {
            com.stripe.model.Customer c = stripeClientService.createCustomer(req.getEmail(), req.getName());
            return ResponseEntity.ok(c);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(e.getMessage());
        }
    }

    @PostMapping("/stripe/subscribe")
    public ResponseEntity<?> createStripeSubscription(@Valid @RequestBody io.pulsegrid.enterprise.service.dto.CreateStripeSubscriptionRequest req) {
        try {
            com.stripe.model.Subscription sub = stripeClientService.createSubscriptionForWorkspace(req.getWorkspaceId(), req.getCustomerId(), req.getPriceId(), req.getPlan());
            return ResponseEntity.ok(sub);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(e.getMessage());
        }
    }

    @DeleteMapping("/subscription/{workspaceId}")
    public ResponseEntity<Void> cancelSubscription(@PathVariable UUID workspaceId) {
        billingService.cancelSubscription(workspaceId);
        return ResponseEntity.noContent().build();
    }
}
