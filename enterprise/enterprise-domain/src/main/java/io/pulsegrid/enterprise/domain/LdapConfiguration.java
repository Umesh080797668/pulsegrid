package io.pulsegrid.enterprise.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

/**
 * Represents LDAP/Active Directory configuration for enterprise workspaces.
 * Supports both ldaps:// and STARTTLS connections.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "enterprise_ldap_config")
public class LdapConfiguration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, name = "workspace_id", unique = true)
    private UUID workspaceId;

    @Column(nullable = false)
    private String ldapUrl; // e.g., "ldap://ad.company.com:389" or "ldaps://ad.company.com:636"

    @Column(nullable = false)
    private String baseDn; // e.g., "ou=Users,dc=company,dc=com"

    @Column(nullable = false)
    private String bindDn; // e.g., "cn=admin,dc=company,dc=com"

    @Column(nullable = false)
    private String bindPassword; // Should be encrypted in production

    @Column(nullable = false)
    private String userSearchBase; // e.g., "ou=Users"

    @Column(nullable = false)
    private String userSearchFilter; // e.g., "(uid={0})" or "(sAMAccountName={0})" for AD

    @Column(nullable = false)
    private String groupSearchBase; // e.g., "ou=Groups"

    @Column(nullable = false)
    private String groupSearchFilter; // e.g., "(member={0})" for AD

    @Column(name = "group_member_attribute")
    private String groupMemberAttribute; // e.g., "member" or "memberOf" for AD (default: "member")

    @Column(name = "use_starttls")
    private Boolean useStarttls; // If false, use LDAPS

    @Column(nullable = false, name = "enabled")
    private Boolean enabled;

    @Lob
    @Column(name = "group_role_mapping_json", nullable = false)
    private String groupRoleMappingJson; // JSON mapping {"ldap-group-name": "pulsegrid-role"}

    @Column(name = "sync_interval_minutes")
    private Integer syncIntervalMinutes; // Default: 60 minutes

    @Column(name = "last_sync_at")
    private Instant lastSyncAt;

    @Column(name = "last_sync_status")
    private String lastSyncStatus; // "SUCCESS", "FAILED", "SKIPPED"

    @Column(name = "last_sync_error")
    @Lob
    private String lastSyncError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
        if (useStarttls == null) {
            useStarttls = false;
        }
        if (syncIntervalMinutes == null) {
            syncIntervalMinutes = 60;
        }
        if (groupMemberAttribute == null) {
            groupMemberAttribute = "member";
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
