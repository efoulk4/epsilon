-- Index to make deduplication deletes efficient when a product fires
-- repeated webhooks with ongoing violations.
CREATE INDEX IF NOT EXISTS idx_product_notifications_dedup
  ON product_notifications(shop, product_id, seen);
