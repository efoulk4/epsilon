-- Create audits table to store accessibility audit results
CREATE TABLE IF NOT EXISTS audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  total_violations INTEGER NOT NULL,
  violations_by_impact JSONB NOT NULL,
  health_score INTEGER NOT NULL,
  violations JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on url for faster queries
CREATE INDEX IF NOT EXISTS idx_audits_url ON audits(url);

-- Create index on timestamp for sorting
CREATE INDEX IF NOT EXISTS idx_audits_timestamp ON audits(timestamp DESC);

-- Create index on created_at for history queries
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at DESC);

-- Add Row Level Security (RLS)
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (you can customize this based on your auth setup)
CREATE POLICY "Allow all operations on audits" ON audits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE audits IS 'Stores accessibility audit results for websites';
