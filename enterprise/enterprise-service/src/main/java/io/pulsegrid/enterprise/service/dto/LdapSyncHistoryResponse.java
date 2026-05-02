package io.pulsegrid.enterprise.service.dto;

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
public class LdapSyncHistoryResponse {

    private UUID id;
    private UUID workspaceId;
    private Instant syncAt;
    private String status;
    private Integer usersSynced;
    private Integer usersCreated;
    private Integer usersUpdated;
    private Integer groupsSynced;
    private String errorMessage;
    private Long syncDurationMs;
    private String triggeredBy;
}
