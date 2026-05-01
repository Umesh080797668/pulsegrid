create table if not exists enterprise_plans (
    code varchar(32) primary key,
    label varchar(128) not null,
    monthly_price_usd integer not null,
    max_workspaces integer not null,
    max_users integer not null,
    included_events_per_month bigint not null,
    overage_usd_per_thousand_events numeric(12,2) not null,
    schema_isolation boolean not null default false,
    sso_enabled boolean not null default false,
    ldap_sync_enabled boolean not null default false,
    note varchar(255) not null
);

create table if not exists enterprise_audit_log (
    id uuid primary key,
    actor varchar(255) not null,
    action varchar(255) not null,
    target varchar(255) not null,
    created_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
);

create table if not exists enterprise_compliance_request (
    id uuid primary key,
    request_type varchar(64) not null,
    status varchar(64) not null,
    subject varchar(255) not null,
    created_at timestamptz not null default now(),
    completed_at timestamptz null,
    notes text null
);

create table if not exists enterprise_invoice (
    id uuid primary key,
    workspace_id uuid not null,
    plan_code varchar(32) not null,
    invoice_number varchar(64) not null unique,
    amount_cents bigint not null,
    currency varchar(8) not null default 'USD',
    metered_events bigint not null,
    overage_cents bigint not null,
    status varchar(32) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_enterprise_invoice_workspace on enterprise_invoice(workspace_id, created_at desc);