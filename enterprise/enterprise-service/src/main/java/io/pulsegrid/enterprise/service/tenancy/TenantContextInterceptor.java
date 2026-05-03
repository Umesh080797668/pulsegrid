package io.pulsegrid.enterprise.service.tenancy;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

/**
 * HTTP interceptor that extracts tenant context from requests.
 * Supports tenant ID from header (X-Tenant-ID) or JWT token context.
 * Also extracts or resolves tenant plan for schema routing.
 */
@Component
public class TenantContextInterceptor implements HandlerInterceptor {

    public static final String TENANT_HEADER = "X-Tenant-ID";
    public static final String PLAN_HEADER = "X-Tenant-Plan";

    private final TenantProvider tenantProvider;

    public TenantContextInterceptor(TenantProvider tenantProvider) {
        this.tenantProvider = tenantProvider;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        try {
            // Extract tenant ID from header
            String tenantIdHeader = request.getHeader(TENANT_HEADER);
            if (tenantIdHeader == null || tenantIdHeader.isEmpty()) {
                // Try to get from request attribute (e.g., set by JWT filter)
                Object tenantAttr = request.getAttribute(TENANT_HEADER);
                if (tenantAttr != null) {
                    tenantIdHeader = tenantAttr.toString();
                }
            }

            if (tenantIdHeader == null || tenantIdHeader.isEmpty()) {
                throw new TenantResolutionException("Missing tenant ID header: " + TENANT_HEADER);
            }

            // Validate tenant ID is valid UUID
            try {
                UUID.fromString(tenantIdHeader);
            } catch (IllegalArgumentException e) {
                throw new TenantResolutionException("Invalid tenant ID format: " + tenantIdHeader);
            }

            // Extract plan from header or default to FREE
            String planHeader = request.getHeader(PLAN_HEADER);
            TenantContext.TenantPlan plan = TenantContext.TenantPlan.FREE;
            if (planHeader != null && !planHeader.isEmpty()) {
                try {
                    plan = TenantContext.TenantPlan.valueOf(planHeader.toUpperCase());
                } catch (IllegalArgumentException e) {
                    plan = TenantContext.TenantPlan.FREE;
                }
            }

            // Set up context
            TenantContext.setTenantId(tenantIdHeader);
            TenantContext.setTenantPlan(plan);
            String schemaName = tenantProvider.resolveSchemaName(UUID.fromString(tenantIdHeader), plan);
            TenantContext.setSchemaName(schemaName);

            return true;
        } catch (TenantResolutionException e) {
            // Log the error and return 401 Unauthorized
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return false;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // Clear tenant context after request
        TenantContext.clear();
    }
}
