-- Track whether an audit was run manually or by the cron scheduler,
-- and whether the merchant has viewed the results.

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS seen BOOLEAN NOT NULL DEFAULT true;

-- Scheduled audits start unseen so merchants get notified
-- Manual audits are seen immediately (merchant triggered them)
UPDATE audits SET source = 'manual', seen = true WHERE source = 'manual';

CREATE INDEX IF NOT EXISTS idx_audits_shop_unseen ON audits(shop, seen) WHERE seen = false;
