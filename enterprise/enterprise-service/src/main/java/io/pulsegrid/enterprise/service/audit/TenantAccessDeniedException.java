package io.pulsegrid.enterprise.service.audit;

/**
 * Thrown when a request tries to access or write audit data outside of the active tenant scope.
 */
public class TenantAccessDeniedException extends RuntimeException {

    public TenantAccessDeniedException(String message) {
        super(message);
    }
}