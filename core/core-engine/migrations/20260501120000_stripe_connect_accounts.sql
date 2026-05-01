ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;
