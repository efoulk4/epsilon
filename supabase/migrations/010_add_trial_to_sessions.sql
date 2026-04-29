-- Add trial_ends_at to shopify_sessions for 7-day free trial tracking
ALTER TABLE shopify_sessions
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
