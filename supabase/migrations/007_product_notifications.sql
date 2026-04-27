-- Stores pending accessibility notifications for merchants.
-- Written by webhook handlers when a product create/update triggers violations.
-- Read and cleared when the merchant opens the app.

CREATE TABLE IF NOT EXISTS product_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  product_handle TEXT NOT NULL,
  violations JSONB NOT NULL DEFAULT '[]',
  seen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_notifications_shop ON product_notifications(shop, seen);

ALTER TABLE product_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage product_notifications" ON product_notifications
  FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'))
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'));
