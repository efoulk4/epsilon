-- Enable RLS on all tables and enforce service-role-only access.
-- The backend exclusively uses the service role key, which bypasses RLS,
-- so these deny-all policies block anon/public access without affecting the app.

-- audits
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on audits" ON audits;
DROP POLICY IF EXISTS "Enable read access for all users" ON audits;
DROP POLICY IF EXISTS "Enable insert for all users" ON audits;
DROP POLICY IF EXISTS "Enable all access for all users" ON audits;
CREATE POLICY "Service role only" ON audits AS RESTRICTIVE
  USING (auth.role() = 'service_role');

-- shopify_sessions
DROP POLICY IF EXISTS "Service role can manage sessions" ON shopify_sessions;
CREATE POLICY "Service role only" ON shopify_sessions AS RESTRICTIVE
  USING (auth.role() = 'service_role');

-- proposed_fixes
ALTER TABLE proposed_fixes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON proposed_fixes AS RESTRICTIVE
  USING (auth.role() = 'service_role');

-- gdpr_requests
ALTER TABLE gdpr_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON gdpr_requests AS RESTRICTIVE
  USING (auth.role() = 'service_role');

-- product_notifications
DROP POLICY IF EXISTS "Service role can manage product_notifications" ON product_notifications;
CREATE POLICY "Service role only" ON product_notifications AS RESTRICTIVE
  USING (auth.role() = 'service_role');
