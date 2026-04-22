-- Migration: Add proposed_fixes table for AI-generated fix approval workflow
-- This ensures AI-generated fixes are reviewed before being applied to production

-- Create enum for fix status
CREATE TYPE fix_status AS ENUM ('pending', 'approved', 'rejected', 'applied', 'failed');

-- Create proposed_fixes table
CREATE TABLE IF NOT EXISTS proposed_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop TEXT NOT NULL, -- Tenant isolation
  violation_id TEXT NOT NULL,
  violation_description TEXT NOT NULL,
  affected_resource_type TEXT, -- 'product', 'page', 'theme', etc.
  affected_resource_id TEXT, -- Product ID, Page ID, etc.

  -- AI-generated fix details
  ai_explanation TEXT NOT NULL,
  original_code TEXT,
  proposed_code TEXT NOT NULL,
  fix_type TEXT, -- 'html', 'css', 'attribute', etc.
  confidence_score NUMERIC(3,2), -- AI confidence 0.00-1.00

  -- Approval workflow
  status fix_status DEFAULT 'pending',
  reviewed_by TEXT, -- User who reviewed
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Application tracking
  applied_at TIMESTAMPTZ,
  application_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_proposed_fixes_shop ON proposed_fixes(shop);
CREATE INDEX idx_proposed_fixes_shop_status ON proposed_fixes(shop, status);
CREATE INDEX idx_proposed_fixes_created_at ON proposed_fixes(created_at DESC);

-- Row Level Security - disable for server-side only access
ALTER TABLE proposed_fixes DISABLE ROW LEVEL SECURITY;

-- Comments
COMMENT ON TABLE proposed_fixes IS 'Stores AI-generated accessibility fixes pending review. Server-side access only via service role.';
COMMENT ON COLUMN proposed_fixes.shop IS 'Shop domain for tenant isolation. REQUIRED.';
COMMENT ON COLUMN proposed_fixes.status IS 'Workflow status: pending (awaiting review), approved (ready to apply), rejected (not safe), applied (successfully applied), failed (application error)';
COMMENT ON COLUMN proposed_fixes.confidence_score IS 'AI model confidence score 0.00-1.00. Higher scores indicate more confident fixes.';
