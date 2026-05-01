package com.pulsegrid.enterprise.tenant;

import jakarta.validation.constraints.NotBlank;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/enterprise/tenants")
public class TenantController {

	private final TenantSchemaService tenantSchemaService;

	public TenantController(TenantSchemaService tenantSchemaService) {
		this.tenantSchemaService = tenantSchemaService;
	}

	@GetMapping("/{workspaceId}")
	public TenantSchemaService.TenantSchemaDescriptor describe(@PathVariable @NotBlank String workspaceId) {
		return tenantSchemaService.describeWorkspace(workspaceId, workspaceId);
	}
}
