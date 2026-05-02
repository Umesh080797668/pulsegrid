package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LdapConfigurationResponse {

    private UUID id;
    private UUID workspaceId;
    private String ldapUrl;
    private String baseDn;
    private String bindDn;
    private String userSearchBase;
    private String userSearchFilter;
    private String groupSearchBase;
    private String groupSearchFilter;
    private String groupMemberAttribute;
    private Boolean useStarttls;
    private Boolean enabled;
    private Map<String, String> groupRoleMapping;
    private Integer syncIntervalMinutes;
    private Instant lastSyncAt;
    private String lastSyncStatus;
    private String lastSyncError;
    private Instant createdAt;
    private Instant updatedAt;
}
