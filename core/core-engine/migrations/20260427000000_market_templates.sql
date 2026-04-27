-- Migration: Create Marketplace Templates table

CREATE TABLE market_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    flow_definition JSONB NOT NULL,
    price_cents INT NOT NULL DEFAULT 0,
    category VARCHAR(100),
    tags TEXT[],
    install_count INT DEFAULT 0,
    rating_avg DECIMAL(3,2),
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for quick marketplace searches
CREATE INDEX idx_market_templates_published ON market_templates(published, created_at DESC);
CREATE INDEX idx_market_templates_category ON market_templates(category);
