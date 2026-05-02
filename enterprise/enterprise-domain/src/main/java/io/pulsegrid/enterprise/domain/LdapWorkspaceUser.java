package io.pulsegrid.enterprise.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "enterprise_ldap_users", indexes = {
        @Index(name = "idx_ldap_user_workspace", columnList = "workspace_id"),
        @Index(name = "idx_ldap_user_username", columnList = "username")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uk_ldap_user_workspace_username", columnNames = {"workspace_id", "username"})
})
public class LdapWorkspaceUser {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(nullable = false)
    private String username;

    @Column(name = "distinguished_name")
    private String distinguishedName;

    @Column
    private String email;

    @Column(name = "display_name")
    private String displayName;

    @Lob
    @Column(name = "ldap_groups_json", nullable = false)
    private String ldapGroupsJson;

    @Lob
    @Column(name = "roles_json", nullable = false)
    private String rolesJson;

    @Column(nullable = false)
    private Boolean active;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
        if (active == null) {
            active = true;
        }
        if (ldapGroupsJson == null) {
            ldapGroupsJson = "[]";
        }
        if (rolesJson == null) {
            rolesJson = "[]";
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
