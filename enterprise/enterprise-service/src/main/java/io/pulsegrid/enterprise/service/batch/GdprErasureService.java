package io.pulsegrid.enterprise.service.batch;

import io.pulsegrid.enterprise.service.config.GdprProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class GdprErasureService {

    private static final byte[] EMPTY_BLOB = new byte[0];

    private final JdbcTemplate jdbcTemplate;
    private final MasterKeyPurgeClient masterKeyPurgeClient;
    private final GdprProperties gdprProperties;

    public GdprErasureService(JdbcTemplate jdbcTemplate, MasterKeyPurgeClient masterKeyPurgeClient, GdprProperties gdprProperties) {
        this.jdbcTemplate = jdbcTemplate;
        this.masterKeyPurgeClient = masterKeyPurgeClient;
        this.gdprProperties = gdprProperties;
    }

    @Transactional
    public ErasureResult eraseUser(UUID workspaceId, UUID userId) {
        UUID placeholderUserId = ensurePlaceholderUser();

        jdbcTemplate.update("UPDATE flows SET created_by = NULL WHERE created_by = ?", userId);
        jdbcTemplate.update("UPDATE workspaces SET owner_user_id = ? WHERE owner_user_id = ?", placeholderUserId, userId);
        jdbcTemplate.update("DELETE FROM workspace_members WHERE user_id = ?", userId);
        long deletedAuditLogs = jdbcTemplate.update("DELETE FROM enterprise_audit_logs WHERE workspace_id = ? AND user_id = ?", workspaceId, userId);
        long purgedCredentials = jdbcTemplate.update(
                "UPDATE credentials SET encrypted_blob = ?, nonce = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?",
                EMPTY_BLOB,
                EMPTY_BLOB,
                workspaceId
        );
        long anonymizedFlowRuns = jdbcTemplate.update(
                "UPDATE flow_runs SET steps_log = ?, error_message = ?, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE workspace_id = ?",
                "{\"anonymized\":true,\"reason\":\"gdpr_erasure\"}",
                "Anonymized under GDPR erasure",
                workspaceId
        );

        jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);

        masterKeyPurgeClient.purge(workspaceId, userId);

        return new ErasureResult(workspaceId, userId, placeholderUserId, deletedAuditLogs, anonymizedFlowRuns, purgedCredentials);
    }

    private UUID ensurePlaceholderUser() {
        List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                "SELECT id FROM users WHERE email = ?",
                gdprProperties.getPlaceholderUserEmail()
        );

        if (!existing.isEmpty()) {
            Object value = existing.get(0).get("id");
            return value instanceof UUID uuid ? uuid : UUID.fromString(String.valueOf(value));
        }

        UUID placeholderId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, full_name, avatar_url, email_verified, created_at) VALUES (?, ?, NULL, ?, ?, TRUE, CURRENT_TIMESTAMP)",
                placeholderId,
                gdprProperties.getPlaceholderUserEmail(),
                gdprProperties.getPlaceholderUserFullName(),
                gdprProperties.getPlaceholderUserAvatarUrl()
        );
        return placeholderId;
    }

    public record ErasureResult(UUID workspaceId, UUID userId, UUID placeholderUserId, long deletedAuditLogs, long anonymizedFlowRuns, long purgedCredentials) {}
}