package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreateSubscriptionRequest {

    @NotNull(message = "workspaceId is required")
    private UUID workspaceId;

    @NotBlank(message = "stripeCustomerId is required")
    private String stripeCustomerId;

    @NotBlank(message = "stripeSubscriptionId is required")
    private String stripeSubscriptionId;

    @NotBlank(message = "plan is required")
    private String plan;
}
