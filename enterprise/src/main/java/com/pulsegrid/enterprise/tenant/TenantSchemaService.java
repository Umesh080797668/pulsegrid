package com.pulsegrid.enterprise.tenant;

import java.util.Locale;

import org.springframework.stereotype.Service;

@Service
public class TenantSchemaService {

	private static final String DEFAULT_PREFIX = "tenant";

	public TenantSchemaDescriptor describeWorkspace(String workspaceId, String workspaceSlug) {
		String schema = schemaName(workspaceSlug != null && !workspaceSlug.isBlank() ? workspaceSlug : workspaceId);
		return new TenantSchemaDescriptor(workspaceId, workspaceSlug, schema, "Schema-per-tenant isolation enabled");
	}

	public String schemaName(String tenantToken) {
		String normalized = tenantToken == null ? "" : tenantToken.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_");
		if (normalized.isBlank()) {
			normalized = "workspace";
		}
		return DEFAULT_PREFIX + "_" + normalized;
	}

	public record TenantSchemaDescriptor(String workspaceId, String workspaceSlug, String schemaName, String note) {
	}
}
