package com.pulsegrid.enterprise.billing;

import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;

@Service
public class BillingService {

	public List<BillingPlanView> catalog() {
		return List.of(PlanTier.values()).stream().map(this::toView).toList();
	}

	public BillingPlanView findPlan(String code) {
		return toView(PlanTier.fromCode(code));
	}

	public BillingQuote quote(String planCode, long meteredEvents) {
		PlanTier plan = PlanTier.fromCode(planCode);
		long includedEvents = plan.includedEventsPerMonth();
		long overageEvents = Math.max(0L, meteredEvents - includedEvents);
		double overageUsd = (overageEvents / 1_000.0) * plan.overageUsdPerThousandEvents();
		double totalUsd = plan.monthlyPriceUsd() + overageUsd;

		String summary = String.format(Locale.ROOT,
			"%s includes %,d events; %,d additional events billed at $%.2f per 1,000 events.",
			plan.label(), includedEvents, overageEvents, plan.overageUsdPerThousandEvents());

		return new BillingQuote(plan.code(), plan.label(), plan.monthlyPriceUsd(), includedEvents, meteredEvents,
			overageEvents, roundMoney(overageUsd), roundMoney(totalUsd), summary);
	}

	private BillingPlanView toView(PlanTier plan) {
		return new BillingPlanView(
			plan.code(),
			plan.label(),
			plan.monthlyPriceUsd(),
			plan.maxWorkspaces(),
			plan.maxUsers(),
			plan.includedEventsPerMonth(),
			plan.overageUsdPerThousandEvents(),
			plan.schemaIsolation(),
			plan.ssoEnabled(),
			plan.ldapSyncEnabled(),
			plan.note());
	}

	private double roundMoney(double value) {
		return Math.round(value * 100.0) / 100.0;
	}

	public record BillingPlanView(
		String code,
		String label,
		int monthlyPriceUsd,
		int maxWorkspaces,
		int maxUsers,
		long includedEventsPerMonth,
		double overageUsdPerThousandEvents,
		boolean schemaIsolation,
		boolean ssoEnabled,
		boolean ldapSyncEnabled,
		String note) {
	}

	public record BillingQuote(
		String planCode,
		String planLabel,
		int baseMonthlyUsd,
		long includedEvents,
		long meteredEvents,
		long overageEvents,
		double overageUsd,
		double totalMonthlyUsd,
		String summary) {
	}
}
