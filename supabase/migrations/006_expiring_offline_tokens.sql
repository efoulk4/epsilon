-- Add refresh token fields to support Shopify expiring offline tokens
-- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens

ALTER TABLE shopify_sessions
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;
