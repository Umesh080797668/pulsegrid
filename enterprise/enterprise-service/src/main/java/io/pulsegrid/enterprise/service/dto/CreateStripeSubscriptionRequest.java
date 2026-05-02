package io.pulsegrid.enterprise.service.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

@Data
public class CreateStripeSubscriptionRequest {
    @NotNull
    private UUID workspaceId;

    @NotBlank
    private String customerId;

    @NotBlank
    private String priceId;

    @NotBlank
    private String plan;
}
