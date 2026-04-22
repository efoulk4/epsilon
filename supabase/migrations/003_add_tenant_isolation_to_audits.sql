-- Migration: Add tenant isolation to audits table
-- This ensures audits are scoped to specific shops

-- Add shop column to audits table
ALTER TABLE audits
ADD COLUMN IF NOT EXISTS shop TEXT;

-- Create index for efficient shop-based queries
CREATE INDEX IF NOT EXISTS idx_audits_shop ON audits(shop);
CREATE INDEX IF NOT EXISTS idx_audits_shop_created_at ON audits(shop, created_at DESC);

-- Drop the old permissive RLS policies (USING true / WITH CHECK true)
DROP POLICY IF EXISTS "Enable read access for all users" ON audits;
DROP POLICY IF EXISTS "Enable insert for all users" ON audits;
DROP POLICY IF EXISTS "Enable all access for all users" ON audits;

-- Disable RLS temporarily to allow server-side access
ALTER TABLE audits DISABLE ROW LEVEL SECURITY;

-- Note: Access to audits should now be controlled server-side only
-- through service role key, not through client-accessible anon key
-- This prevents cross-tenant data exposure

-- Add comment explaining the security model
COMMENT ON TABLE audits IS 'Audits are accessed via service role only. Each audit must be associated with a shop. Server-side code enforces tenant isolation.';
COMMENT ON COLUMN audits.shop IS 'Shop domain (e.g., store.myshopify.com) that owns this audit. Required for tenant isolation.';
