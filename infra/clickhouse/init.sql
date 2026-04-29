-- ClickHouse initialization script
-- Events and flow run metrics tables for analytics

-- Events received from webhooks
CREATE TABLE IF NOT EXISTS events (
    event_id UUID,
    tenant_id UUID,
    connector LowCardinality(String),
    event_type LowCardinality(String),
    received_at DateTime64(3),
    payload_size_bytes UInt32
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(received_at)
ORDER BY (tenant_id, received_at, connector);

-- Flow run metrics for analytics and monitoring
CREATE TABLE IF NOT EXISTS flow_run_metrics (
    run_id UUID,
    tenant_id UUID,
    flow_id UUID,
    started_at DateTime64(3),
    duration_ms UInt32,
    status LowCardinality(String),
    steps_count UInt8,
    failures_count UInt8
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (tenant_id, started_at);
