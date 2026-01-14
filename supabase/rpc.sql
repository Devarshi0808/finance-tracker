-- RPC helpers to keep transaction + entries atomic while preserving RLS via auth.uid()

create or replace function public.create_transaction_with_entries(
  p_transaction_date date,
  p_description text,
  p_amount_cents bigint,
  p_category_id uuid,
  p_payment_mode_id uuid,
  p_raw_input text,
  p_notes text,
  p_idempotency_key text,
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tx_id uuid;
  v_entry jsonb;
  v_account_id uuid;
  v_entry_type public.entry_type;
  v_entry_amount bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount_cents must be > 0';
  end if;

  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'entries must be a json array';
  end if;

  insert into public.transactions (
    user_id, transaction_date, description, amount_cents,
    category_id, payment_mode_id, raw_input, notes, idempotency_key
  )
  values (
    v_user_id, p_transaction_date, p_description, p_amount_cents,
    p_category_id, p_payment_mode_id, p_raw_input, p_notes, p_idempotency_key
  )
  returning id into v_tx_id;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_account_id := (v_entry->>'account_id')::uuid;
    v_entry_type := (v_entry->>'entry_type')::public.entry_type;
    v_entry_amount := (v_entry->>'amount_cents')::bigint;

    if v_entry_amount is null or v_entry_amount <= 0 then
      raise exception 'entry amount_cents must be > 0';
    end if;

    -- Ensure account belongs to user (including internal income/expense accounts)
    if not exists (select 1 from public.accounts a where a.id = v_account_id and a.user_id = v_user_id) then
      raise exception 'account % not found for user', v_account_id;
    end if;

    insert into public.transaction_entries (transaction_id, account_id, entry_type, amount_cents)
    values (v_tx_id, v_account_id, v_entry_type, v_entry_amount);
  end loop;

  return v_tx_id;
end $$;

create or replace function public.update_transaction_with_entries(
  p_transaction_id uuid,
  p_transaction_date date,
  p_description text,
  p_amount_cents bigint,
  p_category_id uuid,
  p_payment_mode_id uuid,
  p_raw_input text,
  p_notes text,
  p_entries jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_entry jsonb;
  v_account_id uuid;
  v_entry_type public.entry_type;
  v_entry_amount bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.transactions t where t.id = p_transaction_id and t.user_id = v_user_id) then
    raise exception 'transaction not found';
  end if;

  update public.transactions
  set
    transaction_date = p_transaction_date,
    description = p_description,
    amount_cents = p_amount_cents,
    category_id = p_category_id,
    payment_mode_id = p_payment_mode_id,
    raw_input = p_raw_input,
    notes = p_notes
  where id = p_transaction_id and user_id = v_user_id;

  delete from public.transaction_entries where transaction_id = p_transaction_id;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_account_id := (v_entry->>'account_id')::uuid;
    v_entry_type := (v_entry->>'entry_type')::public.entry_type;
    v_entry_amount := (v_entry->>'amount_cents')::bigint;

    if v_entry_amount is null or v_entry_amount <= 0 then
      raise exception 'entry amount_cents must be > 0';
    end if;

    if not exists (select 1 from public.accounts a where a.id = v_account_id and a.user_id = v_user_id) then
      raise exception 'account % not found for user', v_account_id;
    end if;

    insert into public.transaction_entries (transaction_id, account_id, entry_type, amount_cents)
    values (p_transaction_id, v_account_id, v_entry_type, v_entry_amount);
  end loop;
end $$;

create or replace function public.delete_transaction(
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.transactions where id = p_transaction_id and user_id = v_user_id;
end $$;

