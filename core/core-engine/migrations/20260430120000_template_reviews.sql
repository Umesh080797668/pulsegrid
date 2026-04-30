-- Marketplace template reviews

CREATE TABLE template_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES market_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_template_reviews_template_id_created_at
    ON template_reviews(template_id, created_at DESC);
CREATE INDEX idx_template_reviews_user_id
    ON template_reviews(user_id);
