package io.pulsegrid.enterprise.service.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class PlanRedisRepository {

    private static final Logger log = LoggerFactory.getLogger(PlanRedisRepository.class);

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public void savePlan(UUID workspaceId, Map<String, Object> plan) {
        try {
            String json = objectMapper.writeValueAsString(plan);
            String key = "tenant:" + workspaceId + ":plan";
            redisTemplate.opsForValue().set(key, json);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize plan for workspace {}: {}", workspaceId, e.getMessage());
            throw new RuntimeException(e);
        }
    }

    public void deletePlan(UUID workspaceId) {
        String key = "tenant:" + workspaceId + ":plan";
        redisTemplate.delete(key);
    }

    /**
     * Retrieve plan configuration from Redis cache
     * Returns default free plan if not found in cache
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getPlan(UUID workspaceId) {
        try {
            String key = "tenant:" + workspaceId + ":plan";
            String json = redisTemplate.opsForValue().get(key);
            
            if (json == null) {
                // Return default free plan if not cached
                return getDefaultFreePlan();
            }
            
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            log.warn("Failed to deserialize plan for workspace {}: {}", workspaceId, e.getMessage());
            return getDefaultFreePlan();
        }
    }

    /**
     * Get default free plan configuration
     */
    private Map<String, Object> getDefaultFreePlan() {
        return Map.ofEntries(
                Map.entry("plan", "free"),
                Map.entry("max_events_per_day", 1000L),
                Map.entry("max_events_per_month", 30000L),
                Map.entry("max_flows", 5),
                Map.entry("max_connectors", 3),
                Map.entry("max_team_members", 1),
                Map.entry("allowed_connector_tier", "free"),
                Map.entry("run_history_days", 7),
                Map.entry("advanced_analytics", false),
                Map.entry("priority_support", false)
        );
    }
}
