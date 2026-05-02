package io.pulsegrid.enterprise.service.service;

import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.stripe.model.PaymentMethod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import io.pulsegrid.enterprise.service.config.StripeConfiguration;

import java.util.*;

@Component
@RequiredArgsConstructor
@Slf4j
public class StripeClientService {

    private final StripeConfiguration stripeConfiguration;
    private final BillingService billingService;

    private void ensureApiKey() {
        if (Stripe.apiKey == null || Stripe.apiKey.isEmpty()) {
            Stripe.apiKey = stripeConfiguration.getKey();
        }
    }

    public Customer createCustomer(String email, String name) throws StripeException {
        ensureApiKey();
        Map<String, Object> params = new HashMap<>();
        params.put("email", email);
        params.put("name", name);
        return Customer.create(params);
    }

    public PaymentMethod attachPaymentMethod(String paymentMethodId, String customerId) throws StripeException {
        ensureApiKey();
        PaymentMethod pm = PaymentMethod.retrieve(paymentMethodId);
        Map<String, Object> params = new HashMap<>();
        params.put("customer", customerId);
        return pm.attach(params);
    }

    public com.stripe.model.Subscription createSubscriptionForWorkspace(UUID workspaceId, String customerId, String priceId, String planName) throws StripeException {
        ensureApiKey();
        Map<String, Object> item = new HashMap<>();
        item.put("price", priceId);
        List<Object> items = new ArrayList<>();
        items.add(item);

        Map<String, Object> params = new HashMap<>();
        params.put("customer", customerId);
        params.put("items", items);

        com.stripe.model.Subscription sub = com.stripe.model.Subscription.create(params);

        // persist in our DB and Redis
        billingService.createOrUpdateSubscription(workspaceId, customerId, sub.getId(), planName);

        return sub;
    }
}
