-- Migration: Add merchant, status, reference_id fields to transactions table
-- Run this in Supabase SQL Editor

-- Add new columns
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_id text;

-- Add check constraint for status values
DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('completed', 'pending', 'failed', 'recurring'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(user_id, status);

-- Add index for merchant search
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(user_id, merchant) WHERE merchant IS NOT NULL;
