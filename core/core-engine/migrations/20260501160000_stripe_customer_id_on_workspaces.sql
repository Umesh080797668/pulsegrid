-- Add stripe_customer_id column to workspaces table to store the Stripe customer ID
-- This is used during upgrade_workspace to support Stripe API integration for subscriptions
ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Create an index for faster lookups when syncing with Stripe webhooks
CREATE INDEX IF NOT EXISTS idx_workspaces_stripe_customer_id ON workspaces(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;
