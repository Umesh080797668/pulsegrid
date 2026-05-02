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
}
