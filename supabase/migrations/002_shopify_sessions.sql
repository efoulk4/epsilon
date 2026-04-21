-- Create shopify_sessions table for storing Shopify OAuth tokens
CREATE TABLE IF NOT EXISTS shopify_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  is_online BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on shop for faster lookups
CREATE INDEX IF NOT EXISTS idx_shopify_sessions_shop ON shopify_sessions(shop);

-- Add RLS policies
ALTER TABLE shopify_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all sessions
CREATE POLICY "Service role can manage sessions" ON shopify_sessions
  FOR ALL
  USING (auth.role() = 'service_role');
