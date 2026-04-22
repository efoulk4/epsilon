-- GDPR request audit log
-- Stores a record of every GDPR/privacy webhook received from Shopify.
-- Required for compliance: demonstrates we acknowledged and actioned requests.
-- Deleted as part of shop/redact (after all other shop data is gone).

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop        TEXT        NOT NULL,
  type        TEXT        NOT NULL, -- 'customers/data_request' | 'customers/redact' | 'shop/redact'
  payload     JSONB       NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_requests_shop ON gdpr_requests(shop);
CREATE INDEX idx_gdpr_requests_type ON gdpr_requests(shop, type);

-- Server-side only via service role key — no RLS needed
ALTER TABLE gdpr_requests DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gdpr_requests IS 'Compliance audit log of GDPR/privacy webhooks received from Shopify.';
