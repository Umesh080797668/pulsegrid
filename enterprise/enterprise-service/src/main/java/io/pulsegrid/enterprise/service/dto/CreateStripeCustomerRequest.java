package io.pulsegrid.enterprise.service.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

@Data
public class CreateStripeCustomerRequest {
    @NotNull
    private UUID workspaceId;

    @Email
    @NotBlank
    private String email;

    private String name;
}
