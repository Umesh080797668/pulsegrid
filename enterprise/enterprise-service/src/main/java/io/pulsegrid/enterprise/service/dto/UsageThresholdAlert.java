package io.pulsegrid.enterprise.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Represents a usage threshold alert when workspace approaches plan limits
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UsageThresholdAlert {
    
    private UUID workspaceId;
    
    /**
     * The metric being tracked: daily_events, monthly_events, flows, connectors, team_members
     */
    private String metric;
    
    /**
     * Current usage value
     */
    private long currentUsage;
    
    /**
     * Plan limit for this metric
     */
    private long limit;
    
    /**
     * Percentage of limit used (0-100+)
     */
    private int percentageUsed;
    
    /**
     * Severity level: warning (80-99%) or critical (100%+)
     */
    private String severity;
    
    /**
     * Human-readable alert message
     */
    private String message;
    
    /**
     * Recommended plan tier upgrade
     */
    private String suggestedPlan;
}
