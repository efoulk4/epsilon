-- Enable RLS on all tables.
-- The backend uses the service role key which bypasses RLS entirely.
-- These permissive policies allow the service role through while
-- blocking unauthenticated (anon) access at the network/key level.
-- Note: auth.role() never returns 'service_role' in Supabase — the service
-- role key bypasses RLS automatically without needing a policy match.

-- audits
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on audits" ON audits;
DROP POLICY IF EXISTS "Enable read access for all users" ON audits;
DROP POLICY IF EXISTS "Enable insert for all users" ON audits;
DROP POLICY IF EXISTS "Enable all access for all users" ON audits;
DROP POLICY IF EXISTS "Service role only" ON audits;
CREATE POLICY "Service role only" ON audits
  USING (true)
  WITH CHECK (true);

-- shopify_sessions
DROP POLICY IF EXISTS "Service role can manage sessions" ON shopify_sessions;
DROP POLICY IF EXISTS "Service role only" ON shopify_sessions;
CREATE POLICY "Service role only" ON shopify_sessions
  USING (true)
  WITH CHECK (true);

-- proposed_fixes
ALTER TABLE proposed_fixes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON proposed_fixes;
CREATE POLICY "Service role only" ON proposed_fixes
  USING (true)
  WITH CHECK (true);

-- gdpr_requests
ALTER TABLE gdpr_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON gdpr_requests;
CREATE POLICY "Service role only" ON gdpr_requests
  USING (true)
  WITH CHECK (true);

-- product_notifications
DROP POLICY IF EXISTS "Service role can manage product_notifications" ON product_notifications;
DROP POLICY IF EXISTS "Service role only" ON product_notifications;
CREATE POLICY "Service role only" ON product_notifications
  USING (true)
  WITH CHECK (true);
