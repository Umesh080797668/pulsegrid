ALTER TABLE enterprise_audit_logs
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS before_state jsonb,
    ADD COLUMN IF NOT EXISTS after_state jsonb,
    ADD COLUMN IF NOT EXISTS clickhouse_synced BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS immutable_hash VARCHAR(128);

UPDATE enterprise_audit_logs
SET event_type = COALESCE(event_type, 'ADMIN_ACTION')
WHERE event_type IS NULL;

ALTER TABLE enterprise_audit_logs
    ALTER COLUMN event_type SET NOT NULL;

CREATE OR REPLACE FUNCTION enterprise_audit_logs_immutable_guard()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'enterprise_audit_logs is append-only and immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enterprise_audit_logs_no_update ON enterprise_audit_logs;
DROP TRIGGER IF EXISTS trg_enterprise_audit_logs_no_delete ON enterprise_audit_logs;

CREATE TRIGGER trg_enterprise_audit_logs_no_update
    BEFORE UPDATE ON enterprise_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION enterprise_audit_logs_immutable_guard();

CREATE TRIGGER trg_enterprise_audit_logs_no_delete
    BEFORE DELETE ON enterprise_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION enterprise_audit_logs_immutable_guard();
