package io.pulsegrid.enterprise.service.service;

/**
 * Exception thrown when tenant management operations fail.
 */
public class TenantManagementException extends RuntimeException {

    public TenantManagementException(String message) {
        super(message);
    }

    public TenantManagementException(String message, Throwable cause) {
        super(message, cause);
    }
}
