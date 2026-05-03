package io.pulsegrid.enterprise.service.batch;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pulsegrid.enterprise.service.config.GdprProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.batch.core.Job;
import org.springframework.batch.core.JobExecution;
import org.springframework.batch.core.JobParameters;
import org.springframework.batch.core.JobParametersBuilder;
import org.springframework.batch.core.launch.JobLauncher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
public class GdprExportService {

    private final JobLauncher jobLauncher;
    private final Job gdprExportJob;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final GdprProperties gdprProperties;

    public GdprExportService(
            JobLauncher jobLauncher,
            Job gdprExportJob,
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            GdprProperties gdprProperties
    ) {
        this.jobLauncher = jobLauncher;
        this.gdprExportJob = gdprExportJob;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.gdprProperties = gdprProperties;
    }

    public Path launchExport(UUID workspaceId, UUID userId) {
        try {
            Path outputDirectory = Path.of(gdprProperties.getExportDirectory()).toAbsolutePath().normalize();
            Files.createDirectories(outputDirectory);

            Path outputFile = outputDirectory.resolve(String.format(
                    "gdpr-export-%s-%s-%d.json",
                    workspaceId,
                    userId,
                    Instant.now().toEpochMilli()
            ));

            JobParameters parameters = new JobParametersBuilder()
                    .addString("workspaceId", workspaceId.toString())
                    .addString("userId", userId.toString())
                    .addString("outputFile", outputFile.toString())
                    .addLong("startedAt", Instant.now().toEpochMilli())
                    .toJobParameters();

            JobExecution execution = jobLauncher.run(gdprExportJob, parameters);
            if (execution.getStatus().isUnsuccessful()) {
                throw new IllegalStateException("GDPR export batch job did not complete successfully: " + execution.getStatus());
            }

            return outputFile;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to generate GDPR export", ex);
        }
    }

    public void writeExportSnapshot(UUID workspaceId, UUID userId, Path outputFile) throws IOException {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("exportType", "gdpr-user-export");
        snapshot.put("exportedAt", Instant.now().toString());
        snapshot.put("workspaceId", workspaceId.toString());
        snapshot.put("userId", userId.toString());
        snapshot.put("user", fetchSingleRow(
                "SELECT id, email, password_hash, full_name, avatar_url, email_verified, created_at FROM users WHERE id = ?",
                userId
        ).orElseThrow(() -> new IllegalArgumentException("User not found: " + userId)));
        snapshot.put("flowRuns", fetchRows(
                "SELECT id, flow_id, workspace_id, status, trigger_event_id, started_at, completed_at, duration_ms, steps_log, error_message FROM flow_runs WHERE workspace_id = ? ORDER BY started_at DESC",
                workspaceId
        ));
        snapshot.put("credentialsMetadata", fetchRows(
                "SELECT id, workspace_id, connector_id, name, metadata, expires_at, created_at, updated_at FROM credentials WHERE workspace_id = ? ORDER BY connector_id ASC",
                workspaceId
        ));
        snapshot.put("auditLogs", fetchRows(
                "SELECT id, workspace_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at FROM enterprise_audit_logs WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC",
                workspaceId, userId
        ));

        Files.writeString(outputFile, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(snapshot));
        log.info("GDPR export written to {} for workspace={} user={}", outputFile, workspaceId, userId);
    }

    private java.util.Optional<Map<String, Object>> fetchSingleRow(String sql, Object... args) {
        List<Map<String, Object>> rows = fetchRows(sql, args);
        return rows.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(rows.get(0));
    }

    private List<Map<String, Object>> fetchRows(String sql, Object... args) {
        return jdbcTemplate.queryForList(sql, args).stream()
                .map(this::normalizeRow)
                .toList();
    }

    private Map<String, Object> normalizeRow(Map<String, Object> row) {
        LinkedHashMap<String, Object> normalized = new LinkedHashMap<>();
        row.forEach((key, value) -> normalized.put(key, normalizeValue(value)));
        return normalized;
    }

    private Object normalizeValue(Object value) {
        if (value == null) {
            return null;
        }

        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant().toString();
        }

        if (value instanceof java.sql.Date date) {
            return date.toLocalDate().toString();
        }

        if (value instanceof java.sql.Time time) {
            return time.toLocalTime().toString();
        }

        if (value instanceof byte[] bytes) {
            return Base64.getEncoder().encodeToString(bytes);
        }

        if (value instanceof String text) {
            return normalizeText(text);
        }

        return value;
    }

    private Object normalizeText(String text) {
        String trimmed = text.trim();
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
                return objectMapper.readValue(trimmed, Object.class);
            } catch (JsonProcessingException ignored) {
                return text;
            }
        }
        return text;
    }
}