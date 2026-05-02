package io.pulsegrid.enterprise.service.controller;

import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.Invoice;
import com.stripe.model.Subscription;
import com.stripe.net.Webhook;
import io.pulsegrid.enterprise.service.config.StripeConfiguration;
import io.pulsegrid.enterprise.service.service.BillingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/billing")
@RequiredArgsConstructor
@Slf4j
public class StripeWebhookController {

    private final StripeConfiguration stripeConfiguration;
    private final BillingService billingService;

    @PostMapping("/webhook")
    public ResponseEntity<String> handleWebhook(@RequestBody String payload,
                                                @RequestHeader("Stripe-Signature") String sigHeader) {
        String endpointSecret = stripeConfiguration.getWebhookSecret();
        Event event;
        try {
            event = Webhook.constructEvent(payload, sigHeader, endpointSecret);
        } catch (SignatureVerificationException e) {
            log.warn("Webhook signature verification failed: {}", e.getMessage());
            return ResponseEntity.status(400).body("Invalid signature");
        } catch (Exception e) {
            log.warn("Failed to parse webhook event: {}", e.getMessage());
            return ResponseEntity.status(400).body("Invalid payload");
        }

        String type = event.getType();

        try {
            switch (type) {
                case "invoice.payment_failed": {
                    Invoice invoice = (Invoice) event.getDataObjectDeserializer().getObject().orElse(null);
                    if (invoice != null) {
                        String stripeSubscriptionId = invoice.getSubscription();
                        billingService.markSubscriptionPastDueByStripeId(stripeSubscriptionId);
                        log.info("Invoice payment failed for subscription {}", stripeSubscriptionId);
                    }
                    break;
                }
                case "customer.subscription.deleted": {
                    Subscription sub = (Subscription) event.getDataObjectDeserializer().getObject().orElse(null);
                    if (sub != null) {
                        String stripeSubscriptionId = sub.getId();
                        billingService.handleSubscriptionDeletedByStripeId(stripeSubscriptionId);
                        log.info("Subscription deleted: {}", stripeSubscriptionId);
                    }
                    break;
                }
                default:
                    log.debug("Unhandled Stripe event type: {}", type);
            }
        } catch (Exception e) {
            log.error("Error handling webhook {}: {}", type, e.getMessage());
            return ResponseEntity.status(500).body("error");
        }

        return ResponseEntity.ok("received");
    }
}
