package io.pulsegrid.enterprise.service.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import io.pulsegrid.enterprise.service.dto.UsageThresholdAlert;

import java.util.*;

/**
 * Service for enforcing plan limits and tracking usage thresholds.
 * Reads plan configuration from Redis cache and enforces quotas at runtime.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanEnforcementService {

    private final io.pulsegrid.enterprise.service.repository.PlanRedisRepository planRedisRepository;

    /**
     * Retrieve plan configuration from Redis cache for a workspace
     */
    public Map<String, Object> getPlanConfig(UUID workspaceId) {
        try {
            return planRedisRepository.getPlan(workspaceId);
        } catch (Exception e) {
            log.warn("Failed to retrieve plan config from Redis for workspace {}: {}", workspaceId, e.getMessage());
            return getDefaultPlanConfig();
        }
    }

    /**
     * Check if workspace can create a flow based on plan limits
     */
    public boolean canCreateFlow(UUID workspaceId, int currentFlowCount) {
        Map<String, Object> config = getPlanConfig(workspaceId);
        long maxFlows = ((Number) config.getOrDefault("max_flows", 5L)).longValue();
        return currentFlowCount < maxFlows;
    }

    /**
     * Check if workspace can ingest more events based on daily quota
     */
    public boolean canIngestEvents(UUID workspaceId, long eventsIngestedToday) {
        Map<String, Object> config = getPlanConfig(workspaceId);
        long maxEventsPerDay = ((Number) config.getOrDefault("max_events_per_day", 1000L)).longValue();
        return eventsIngestedToday < maxEventsPerDay;
    }

    /**
     * Check if connector is allowed for workspace's plan tier
     */
    public boolean isConnectorAllowed(UUID workspaceId, String connectorId, String connectorTier) {
        Map<String, Object> config = getPlanConfig(workspaceId);
        String allowedTier = (String) config.getOrDefault("allowed_connector_tier", "free");
        
        return isConnectorTierAllowed(connectorTier, allowedTier);
    }

    /**
     * Check if team member can be added based on plan
     */
    public boolean canAddTeamMember(UUID workspaceId, int currentMemberCount) {
        Map<String, Object> config = getPlanConfig(workspaceId);
        long maxMembers = ((Number) config.getOrDefault("max_team_members", 1L)).longValue();
        return currentMemberCount < maxMembers;
    }

    /**
     * Check if connector limit reached
     */
    public boolean canAddConnector(UUID workspaceId, int currentConnectorCount) {
        Map<String, Object> config = getPlanConfig(workspaceId);
        long maxConnectors = ((Number) config.getOrDefault("max_connectors", 3L)).longValue();
        return currentConnectorCount < maxConnectors;
    }

    /**
     * Get usage threshold alerts for a workspace based on current usage
     */
    public List<UsageThresholdAlert> getThresholdAlerts(
            UUID workspaceId,
            long eventsIngestedToday,
            long eventsIngestedThisMonth,
            int flowCount,
            int connectorCount,
            int teamMemberCount) {
        
        List<UsageThresholdAlert> alerts = new ArrayList<>();
        Map<String, Object> config = getPlanConfig(workspaceId);
        String plan = (String) config.getOrDefault("plan", "free");
        
        long maxEventsPerDay = ((Number) config.getOrDefault("max_events_per_day", 1000L)).longValue();
        long maxEventsPerMonth = ((Number) config.getOrDefault("max_events_per_month", 30000L)).longValue();
        long maxFlows = ((Number) config.getOrDefault("max_flows", 5L)).longValue();
        long maxConnectors = ((Number) config.getOrDefault("max_connectors", 3L)).longValue();
        long maxTeamMembers = ((Number) config.getOrDefault("max_team_members", 1L)).longValue();
        
        // Daily events threshold (80%)
        if (eventsIngestedToday > (maxEventsPerDay * 0.8)) {
            alerts.add(UsageThresholdAlert.builder()
                    .workspaceId(workspaceId)
                    .metric("daily_events")
                    .currentUsage(eventsIngestedToday)
                    .limit(maxEventsPerDay)
                    .percentageUsed((int) ((eventsIngestedToday * 100) / maxEventsPerDay))
                    .severity(eventsIngestedToday > maxEventsPerDay ? "critical" : "warning")
                    .message(String.format(
                            "You've used %d/%d daily events. %s",
                            eventsIngestedToday,
                            maxEventsPerDay,
                            plan.equals("business") ? "Upgrade to higher tier for increased limits." : "Upgrade to Pro or Business for higher limits."
                    ))
                    .suggestedPlan(suggestPlanUpgrade(plan))
                    .build());
        }
        
        // Monthly events threshold (80%)
        if (eventsIngestedThisMonth > (maxEventsPerMonth * 0.8)) {
            alerts.add(UsageThresholdAlert.builder()
                    .workspaceId(workspaceId)
                    .metric("monthly_events")
                    .currentUsage(eventsIngestedThisMonth)
                    .limit(maxEventsPerMonth)
                    .percentageUsed((int) ((eventsIngestedThisMonth * 100) / maxEventsPerMonth))
                    .severity(eventsIngestedThisMonth > maxEventsPerMonth ? "critical" : "warning")
                    .message(String.format(
                            "You've used %d/%d monthly events. Upgrade your plan for higher limits.",
                            eventsIngestedThisMonth,
                            maxEventsPerMonth
                    ))
                    .suggestedPlan(suggestPlanUpgrade(plan))
                    .build());
        }
        
        // Flows threshold (80%)
        if (flowCount > (maxFlows * 0.8)) {
            alerts.add(UsageThresholdAlert.builder()
                    .workspaceId(workspaceId)
                    .metric("flows")
                    .currentUsage(flowCount)
                    .limit(maxFlows)
                    .percentageUsed((int) ((flowCount * 100) / maxFlows))
                    .severity(flowCount >= maxFlows ? "critical" : "warning")
                    .message(String.format(
                            "You've created %d/%d flows. Upgrade to create more.",
                            flowCount,
                            maxFlows
                    ))
                    .suggestedPlan(suggestPlanUpgrade(plan))
                    .build());
        }
        
        // Connectors threshold (80%)
        if (connectorCount > (maxConnectors * 0.8)) {
            alerts.add(UsageThresholdAlert.builder()
                    .workspaceId(workspaceId)
                    .metric("connectors")
                    .currentUsage(connectorCount)
                    .limit(maxConnectors)
                    .percentageUsed((int) ((connectorCount * 100) / maxConnectors))
                    .severity(connectorCount >= maxConnectors ? "critical" : "warning")
                    .message(String.format(
                            "You've configured %d/%d connectors. Upgrade to use more.",
                            connectorCount,
                            maxConnectors
                    ))
                    .suggestedPlan(suggestPlanUpgrade(plan))
                    .build());
        }
        
        // Team members threshold (80%)
        if (teamMemberCount > (maxTeamMembers * 0.8)) {
            alerts.add(UsageThresholdAlert.builder()
                    .workspaceId(workspaceId)
                    .metric("team_members")
                    .currentUsage(teamMemberCount)
                    .limit(maxTeamMembers)
                    .percentageUsed((int) ((teamMemberCount * 100) / maxTeamMembers))
                    .severity(teamMemberCount >= maxTeamMembers ? "critical" : "warning")
                    .message(String.format(
                            "You have %d/%d team members. Upgrade to add more.",
                            teamMemberCount,
                            maxTeamMembers
                    ))
                    .suggestedPlan(suggestPlanUpgrade(plan))
                    .build());
        }
        
        return alerts;
    }

    /**
     * Get recommended plan upgrade based on current plan
     */
    private String suggestPlanUpgrade(String currentPlan) {
        return switch (currentPlan) {
            case "free" -> "pro";
            case "pro" -> "business";
            default -> "business";
        };
    }

    /**
     * Check if a connector tier is allowed for the current plan
     */
    private boolean isConnectorTierAllowed(String connectorTier, String allowedTier) {
        if (allowedTier.equals("all")) return true;
        if (allowedTier.equals("business")) {
            return !connectorTier.equals("enterprise");
        }
        if (allowedTier.equals("pro")) {
            return connectorTier.equals("free") || connectorTier.equals("pro");
        }
        return connectorTier.equals("free");
    }

    /**
     * Get default plan configuration for free tier
     */
    private Map<String, Object> getDefaultPlanConfig() {
        Map<String, Object> map = new HashMap<>();
        map.put("plan", "free");
        map.put("max_events_per_day", 1000L);
        map.put("max_events_per_month", 30000L);
        map.put("max_flows", 5);
        map.put("max_connectors", 3);
        map.put("max_team_members", 1);
        map.put("allowed_connector_tier", "free");
        map.put("run_history_days", 7);
        map.put("advanced_analytics", false);
        map.put("priority_support", false);
        return map;
    }
}
