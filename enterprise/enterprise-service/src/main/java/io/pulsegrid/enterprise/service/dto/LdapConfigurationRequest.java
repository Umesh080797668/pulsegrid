package io.pulsegrid.enterprise.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LdapConfigurationRequest {

    @NotNull
    private UUID workspaceId;

    @NotBlank
    private String ldapUrl; // e.g., "ldap://ad.company.com:389" or "ldaps://ad.company.com:636"

    @NotBlank
    private String baseDn;

    @NotBlank
    private String bindDn;

    @NotBlank
    private String bindPassword;

    @NotBlank
    private String userSearchBase;

    @NotBlank
    private String userSearchFilter; // e.g., "(uid={0})" or "(sAMAccountName={0})" for AD

    @NotBlank
    private String groupSearchBase;

    @NotBlank
    private String groupSearchFilter; // e.g., "(member={0})"

    private String groupMemberAttribute; // e.g., "member" or "memberOf" for AD (default: "member")

    private Boolean useStarttls; // If false, use LDAPS (default: false)

    @NotNull
    private Boolean enabled;

    @NotEmpty
    private Map<String, String> groupRoleMapping; // {"ldap-group-name": "pulsegrid-role"}

    private Integer syncIntervalMinutes; // Default: 60 minutes
}
