-- Add soft delete support to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Create index for faster queries filtering by deleted status
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update the delete_transaction function to soft delete instead of hard delete
CREATE OR REPLACE FUNCTION public.delete_transaction(
  p_transaction_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Soft delete: set deleted_at timestamp instead of deleting
  UPDATE public.transactions
  SET deleted_at = NOW()
  WHERE id = p_transaction_id AND user_id = v_user_id;
END $$;

-- Optional: Create function to permanently delete (for admin use)
CREATE OR REPLACE FUNCTION public.hard_delete_transaction(
  p_transaction_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.transactions WHERE id = p_transaction_id AND user_id = v_user_id;
END $$;

-- Optional: Create function to restore deleted transaction
CREATE OR REPLACE FUNCTION public.restore_transaction(
  p_transaction_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.transactions
  SET deleted_at = NULL
  WHERE id = p_transaction_id AND user_id = v_user_id;
END $$;
