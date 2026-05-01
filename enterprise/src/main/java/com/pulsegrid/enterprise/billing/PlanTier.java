package com.pulsegrid.enterprise.billing;

import java.util.Arrays;
import java.util.Locale;

public enum PlanTier {
	FREE("free", "Free", 0, 3, 5, 1_000, 0.00, false, false, false, "Shared schema"),
	PRO("pro", "Pro", 12, 10, 25, 50_000, 0.75, false, false, false, "Advanced connectors and higher quotas"),
	BUSINESS("business", "Business", 49, 100, 250, 500_000, 0.35, true, true, true, "Tenant-isolated enterprise workspace"),
	ENTERPRISE("enterprise", "Enterprise", 149, 1_000, 5_000, 5_000_000, 0.12, true, true, true, "Custom SSO, compliance exports, and dedicated support");

	private final String code;
	private final String label;
	private final int monthlyPriceUsd;
	private final int maxWorkspaces;
	private final int maxUsers;
	private final long includedEventsPerMonth;
	private final double overageUsdPerThousandEvents;
	private final boolean schemaIsolation;
	private final boolean ssoEnabled;
	private final boolean ldapSyncEnabled;
	private final String note;

	PlanTier(String code, String label, int monthlyPriceUsd, int maxWorkspaces, int maxUsers,
			long includedEventsPerMonth, double overageUsdPerThousandEvents, boolean schemaIsolation,
			boolean ssoEnabled, boolean ldapSyncEnabled, String note) {
		this.code = code;
		this.label = label;
		this.monthlyPriceUsd = monthlyPriceUsd;
		this.maxWorkspaces = maxWorkspaces;
		this.maxUsers = maxUsers;
		this.includedEventsPerMonth = includedEventsPerMonth;
		this.overageUsdPerThousandEvents = overageUsdPerThousandEvents;
		this.schemaIsolation = schemaIsolation;
		this.ssoEnabled = ssoEnabled;
		this.ldapSyncEnabled = ldapSyncEnabled;
		this.note = note;
	}

	public String code() {
		return code;
	}

	public String label() {
		return label;
	}

	public int monthlyPriceUsd() {
		return monthlyPriceUsd;
	}

	public int maxWorkspaces() {
		return maxWorkspaces;
	}

	public int maxUsers() {
		return maxUsers;
	}

	public long includedEventsPerMonth() {
		return includedEventsPerMonth;
	}

	public double overageUsdPerThousandEvents() {
		return overageUsdPerThousandEvents;
	}

	public boolean schemaIsolation() {
		return schemaIsolation;
	}

	public boolean ssoEnabled() {
		return ssoEnabled;
	}

	public boolean ldapSyncEnabled() {
		return ldapSyncEnabled;
	}

	public String note() {
		return note;
	}

	public static PlanTier fromCode(String code) {
		if (code == null || code.isBlank()) {
			return FREE;
		}

		String normalized = code.trim().toLowerCase(Locale.ROOT);
		return Arrays.stream(values())
			.filter(tier -> tier.code.equals(normalized))
			.findFirst()
			.orElse(FREE);
	}
}
