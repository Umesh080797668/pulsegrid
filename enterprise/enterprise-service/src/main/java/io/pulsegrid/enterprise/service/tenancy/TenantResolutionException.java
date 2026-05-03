package io.pulsegrid.enterprise.service.tenancy;

/**
 * Exception thrown when tenant resolution fails.
 */
public class TenantResolutionException extends RuntimeException {

    public TenantResolutionException(String message) {
        super(message);
    }

    public TenantResolutionException(String message, Throwable cause) {
        super(message, cause);
    }
}
