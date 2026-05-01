package com.pulsegrid.enterprise.billing;

import java.util.List;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/enterprise/billing")
@Validated
public class BillingController {

	private final BillingService billingService;

	public BillingController(BillingService billingService) {
		this.billingService = billingService;
	}

	@GetMapping("/plans")
	public List<BillingService.BillingPlanView> catalog() {
		return billingService.catalog();
	}

	@GetMapping("/plans/{planCode}")
	public BillingService.BillingPlanView plan(@PathVariable @NotBlank String planCode) {
		return billingService.findPlan(planCode);
	}

	@GetMapping("/quote")
	public BillingService.BillingQuote quote(
			@RequestParam @NotBlank String plan,
			@RequestParam(defaultValue = "0") @Min(0) long meteredEvents) {
		return billingService.quote(plan, meteredEvents);
	}
}
