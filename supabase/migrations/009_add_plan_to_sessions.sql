-- Add subscription plan to shopify_sessions
-- Values: 'free' | 'basic' | 'pro'
ALTER TABLE shopify_sessions
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Index for querying shops by plan (used by cron audit scheduler)
CREATE INDEX IF NOT EXISTS idx_shopify_sessions_plan ON shopify_sessions(plan);
