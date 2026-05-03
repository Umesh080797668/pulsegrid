package io.pulsegrid.enterprise.service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.pulsegrid.enterprise.domain.AuditLog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Mirrors audit log rows into ClickHouse for fast enterprise audit timeline queries.
 * If ClickHouse is not configured, the service safely no-ops.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditClickHouseService {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${enterprise.audit.clickhouse.url:}")
    private String clickhouseUrl;

    @Value("${enterprise.audit.clickhouse.username:default}")
    private String username;

    @Value("${enterprise.audit.clickhouse.password:}")
    private String password;

    @Value("${enterprise.audit.clickhouse.enabled:false}")
    private boolean enabled;

    @PostConstruct
    public void initialize() {
        if (!isEnabled()) {
            return;
        }
        try {
            executeSql("""
                    CREATE TABLE IF NOT EXISTS enterprise_audit_logs
                    (
                        id UUID,
                        workspace_id UUID,
                        user_id UUID,
                        event_type String,
                        action String,
                        resource_type Nullable(String),
                        resource_id Nullable(String),
                        details Nullable(String),
                        before_state Nullable(String),
                        after_state Nullable(String),
                        ip_address String,
                        user_agent Nullable(String),
                        immutable_hash Nullable(String),
                        created_at DateTime64(3, 'UTC'),
                        clickhouse_synced UInt8
                    )
                    ENGINE = MergeTree
                    ORDER BY (workspace_id, created_at, id)
                    """);
        } catch (Exception e) {
            log.warn("ClickHouse audit table initialization skipped: {}", e.getMessage());
        }
    }

    public void writeAuditLog(AuditLog auditLog) {
        if (!isEnabled() || auditLog == null) {
            return;
        }

        try {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", auditLog.getId());
            row.put("workspace_id", auditLog.getWorkspaceId());
            row.put("user_id", auditLog.getUserId());
            row.put("event_type", auditLog.getEventType());
            row.put("action", auditLog.getAction());
            row.put("resource_type", auditLog.getResourceType());
            row.put("resource_id", auditLog.getResourceId());
            row.put("details", auditLog.getDetails());
            row.put("before_state", auditLog.getBeforeState());
            row.put("after_state", auditLog.getAfterState());
            row.put("ip_address", auditLog.getIpAddress());
            row.put("user_agent", auditLog.getUserAgent());
            row.put("immutable_hash", auditLog.getImmutableHash());
            row.put("created_at", DateTimeFormatter.ISO_INSTANT.format(auditLog.getCreatedAt()));
            row.put("clickhouse_synced", auditLog.isClickhouseSynced() ? 1 : 0);

            String jsonRow = objectMapper.writeValueAsString(row);
            URL url = buildInsertUrl();
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(("INSERT INTO enterprise_audit_logs FORMAT JSONEachRow\n" + jsonRow + "\n").getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                log.warn("ClickHouse returned status {} while mirroring audit log", responseCode);
            }
        } catch (Exception e) {
            log.warn("Failed to mirror audit log to ClickHouse: {}", e.getMessage());
        }
    }

    private boolean isEnabled() {
        return enabled && clickhouseUrl != null && !clickhouseUrl.isBlank();
    }

    private URL buildInsertUrl() throws Exception {
        URI baseUri = URI.create(clickhouseUrl);
        String auth = username != null && !username.isBlank() ? "?user=" + java.net.URLEncoder.encode(username, StandardCharsets.UTF_8) : "";
        String pass = password != null && !password.isBlank() ? (auth.isEmpty() ? "?" : "&") + "password=" + java.net.URLEncoder.encode(password, StandardCharsets.UTF_8) : "";
        URI insertUri = new URI(baseUri.getScheme(), baseUri.getAuthority(), baseUri.getPath(), null, null);
        insertUri = new URI(insertUri.toString() + auth + pass);
        return insertUri.toURL();
    }

    private void executeSql(String sql) throws Exception {
        URL url = buildInsertUrl();
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
        try (OutputStream outputStream = connection.getOutputStream()) {
            outputStream.write(sql.getBytes(StandardCharsets.UTF_8));
        }
        int responseCode = connection.getResponseCode();
        if (responseCode < 200 || responseCode >= 300) {
            throw new IllegalStateException("ClickHouse SQL execution failed with HTTP " + responseCode);
        }
    }
}
