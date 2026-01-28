-- Add is_necessary flag to transactions table
-- This allows marking individual transactions as necessary/unnecessary
-- separate from the category's default is_necessary setting

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_necessary boolean DEFAULT NULL;

-- Create index for filtering by necessity
CREATE INDEX IF NOT EXISTS idx_transactions_is_necessary ON transactions(is_necessary) WHERE is_necessary IS NOT NULL;

-- Update the create_transaction_with_entries RPC to support is_necessary
CREATE OR REPLACE FUNCTION public.create_transaction_with_entries(
  p_transaction_date date,
  p_description text,
  p_amount_cents bigint,
  p_category_id uuid,
  p_payment_mode_id uuid,
  p_raw_input text,
  p_notes text,
  p_idempotency_key text,
  p_entries jsonb,
  p_is_necessary boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tx_id uuid;
  v_entry jsonb;
  v_account_id uuid;
  v_entry_type public.entry_type;
  v_entry_amount bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be > 0';
  END IF;

  IF jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'entries must be a json array';
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description, amount_cents,
    category_id, payment_mode_id, raw_input, notes, idempotency_key, is_necessary
  )
  VALUES (
    v_user_id, p_transaction_date, p_description, p_amount_cents,
    p_category_id, p_payment_mode_id, p_raw_input, p_notes, p_idempotency_key, p_is_necessary
  )
  RETURNING id INTO v_tx_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_account_id := (v_entry->>'account_id')::uuid;
    v_entry_type := (v_entry->>'entry_type')::public.entry_type;
    v_entry_amount := (v_entry->>'amount_cents')::bigint;

    IF v_entry_amount IS NULL OR v_entry_amount <= 0 THEN
      RAISE EXCEPTION 'entry amount_cents must be > 0';
    END IF;

    -- Ensure account belongs to user (including internal income/expense accounts)
    IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = v_account_id AND a.user_id = v_user_id) THEN
      RAISE EXCEPTION 'account % not found for user', v_account_id;
    END IF;

    INSERT INTO public.transaction_entries (transaction_id, account_id, entry_type, amount_cents)
    VALUES (v_tx_id, v_account_id, v_entry_type, v_entry_amount);
  END LOOP;

  RETURN v_tx_id;
END $$;
