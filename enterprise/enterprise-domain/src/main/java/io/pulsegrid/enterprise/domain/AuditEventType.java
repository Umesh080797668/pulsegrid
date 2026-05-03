package io.pulsegrid.enterprise.domain;

/**
 * Enumeration of all auditable privileged events in PulseGrid.
 * These are the events that require SOC 2 compliance audit logging.
 */
public enum AuditEventType {
    // Authentication and access
    LOGIN("User login"),
    LOGOUT("User logout"),
    FAILED_LOGIN("Failed login attempt"),
    
    // Flow management
    FLOW_CREATED("Flow created"),
    FLOW_ENABLED("Flow enabled"),
    FLOW_DISABLED("Flow disabled"),
    FLOW_EXECUTED("Flow executed"),
    FLOW_DELETED("Flow deleted"),
    FLOW_UPDATED("Flow updated"),
    
    // Credential management
    CREDENTIAL_CREATED("Credential created"),
    CREDENTIAL_ACCESSED("Credential accessed"),
    CREDENTIAL_UPDATED("Credential updated"),
    CREDENTIAL_DELETED("Credential deleted"),
    CREDENTIAL_ROTATED("Credential rotated"),
    
    // Subscription and billing
    PLAN_CHANGED("Subscription plan changed"),
    SUBSCRIPTION_UPGRADED("Subscription upgraded"),
    SUBSCRIPTION_DOWNGRADED("Subscription downgraded"),
    SUBSCRIPTION_CANCELLED("Subscription cancelled"),
    PAYMENT_METHOD_UPDATED("Payment method updated"),
    BILLING_ADDRESS_CHANGED("Billing address changed"),
    
    // SSO and authentication configuration
    SSO_CONFIG_CREATED("SSO configuration created"),
    SSO_CONFIG_UPDATED("SSO configuration updated"),
    SSO_CONFIG_DELETED("SSO configuration deleted"),
    SSO_CONFIG_ENABLED("SSO configuration enabled"),
    SSO_CONFIG_DISABLED("SSO configuration disabled"),
    SAML_METADATA_UPDATED("SAML metadata updated"),
    LDAP_CONFIG_UPDATED("LDAP configuration updated"),
    
    // User and member management
    MEMBER_INVITED("Member invited"),
    MEMBER_JOINED("Member joined"),
    MEMBER_ROLE_CHANGED("Member role changed"),
    MEMBER_REMOVED("Member removed"),
    MEMBER_DEACTIVATED("Member deactivated"),
    MEMBER_ACTIVATED("Member activated"),
    
    // Workspace management
    WORKSPACE_CREATED("Workspace created"),
    WORKSPACE_UPDATED("Workspace updated"),
    WORKSPACE_DELETED("Workspace deleted"),
    WORKSPACE_SETTINGS_CHANGED("Workspace settings changed"),
    
    // API key management
    API_KEY_CREATED("API key created"),
    API_KEY_DELETED("API key deleted"),
    API_KEY_ROTATED("API key rotated"),
    
    // Security and compliance
    AUDIT_LOG_EXPORTED("Audit logs exported"),
    AUDIT_LOG_ACCESSED("Audit logs accessed"),
    SECURITY_POLICY_UPDATED("Security policy updated"),
    MFA_ENABLED("Multi-factor authentication enabled"),
    MFA_DISABLED("Multi-factor authentication disabled"),
    
    // Connector management
    CONNECTOR_ADDED("Connector added"),
    CONNECTOR_REMOVED("Connector removed"),
    CONNECTOR_AUTHORIZED("Connector authorized"),
    CONNECTOR_REVOKED("Connector revoked"),
    
    // Administrative actions
    ADMIN_ACTION("Administrative action"),
    CONFIGURATION_CHANGED("Configuration changed"),
    DATA_EXPORT("Data export initiated"),
    DATA_IMPORT("Data import initiated");

    private final String description;

    AuditEventType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }
}
