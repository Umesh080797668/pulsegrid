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

    @DeleteMapping("/subscription/{workspaceId}")
    public ResponseEntity<Void> cancelSubscription(@PathVariable UUID workspaceId) {
        billingService.cancelSubscription(workspaceId);
        return ResponseEntity.noContent().build();
    }
}
