-- FinanceTracker: Supabase schema (double-entry, integer cents) + RLS
-- Apply in Supabase SQL Editor. Then verify policies in Table Editor.

-- Extensions
create extension if not exists pgcrypto;

-- Enums
do $$ begin
  create type public.account_type as enum ('checking','savings','credit_card','emergency_fund','income','expense');
exception
  when duplicate_object then null;
end $$;

-- If the enum already existed from an earlier run, add the internal values safely.
do $$ begin
  alter type public.account_type add value if not exists 'income';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.account_type add value if not exists 'expense';
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.category_type as enum ('income','expense','savings');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.entry_type as enum ('debit','credit');
exception
  when duplicate_object then null;
end $$;

-- Tables
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_name text not null,
  account_type public.account_type not null,
  initial_balance_cents bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.category_type not null,
  subcategory text,
  -- Normalized field to enforce uniqueness when subcategory is NULL
  subcategory_norm text generated always as (coalesce(subcategory, '')) stored,
  icon text,
  color text,
  is_necessary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_unique unique (user_id, type, name, subcategory_norm)
);

create table if not exists public.payment_modes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_modes_name_unique unique (user_id, name)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references public.categories(id) on delete set null,
  payment_mode_id uuid references public.payment_modes(id) on delete set null,
  raw_input text,
  notes text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_idempotency_unique unique (user_id, idempotency_key)
);

create table if not exists public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  entry_type public.entry_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_date on public.transactions(user_id, transaction_date desc);
create index if not exists idx_transaction_entries_account on public.transaction_entries(account_id);
create index if not exists idx_transaction_entries_tx on public.transaction_entries(transaction_id);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null,
  budget_amount_cents bigint not null check (budget_amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_unique unique (user_id, category_id, month)
);

create index if not exists idx_budgets_user_month on public.budgets(user_id, month);

create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  reconciliation_date date not null,
  system_balance_cents bigint not null,
  actual_balance_cents bigint not null,
  notes text,
  is_reconciled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$ begin
  create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger payment_modes_set_updated_at before update on public.payment_modes
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger budgets_set_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger reconciliations_set_updated_at before update on public.reconciliations
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- Ledger balance check (enforced at commit time by trigger)
create or replace function public.ensure_transaction_balanced()
returns trigger language plpgsql as $$
declare
  debit_sum bigint;
  credit_sum bigint;
  tx_id uuid;
begin
  tx_id := coalesce(new.transaction_id, old.transaction_id);
  select
    coalesce(sum(case when entry_type = 'debit' then amount_cents else 0 end), 0),
    coalesce(sum(case when entry_type = 'credit' then amount_cents else 0 end), 0)
  into debit_sum, credit_sum
  from public.transaction_entries
  where transaction_id = tx_id;

  if debit_sum <> credit_sum then
    raise exception 'Transaction % is unbalanced: debits=% credits=%', tx_id, debit_sum, credit_sum;
  end if;

  return null;
end $$;

-- Constraint triggers are deferrable; they run at end of transaction by default.
do $$ begin
  create constraint trigger transaction_entries_balanced_ins
  after insert on public.transaction_entries
  deferrable initially deferred
  for each row execute function public.ensure_transaction_balanced();
exception when duplicate_object then null; end $$;

do $$ begin
  create constraint trigger transaction_entries_balanced_upd
  after update on public.transaction_entries
  deferrable initially deferred
  for each row execute function public.ensure_transaction_balanced();
exception when duplicate_object then null; end $$;

do $$ begin
  create constraint trigger transaction_entries_balanced_del
  after delete on public.transaction_entries
  deferrable initially deferred
  for each row execute function public.ensure_transaction_balanced();
exception when duplicate_object then null; end $$;

-- RLS
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.payment_modes enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;
alter table public.budgets enable row level security;
alter table public.reconciliations enable row level security;

-- accounts
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts
for select using (auth.uid() = user_id);
drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts
for insert with check (auth.uid() = user_id);
drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts
for delete using (auth.uid() = user_id);

-- categories
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
for select using (auth.uid() = user_id);
drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories
for insert with check (auth.uid() = user_id);
drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories
for delete using (auth.uid() = user_id);

-- payment_modes
drop policy if exists payment_modes_select on public.payment_modes;
create policy payment_modes_select on public.payment_modes
for select using (auth.uid() = user_id);
drop policy if exists payment_modes_insert on public.payment_modes;
create policy payment_modes_insert on public.payment_modes
for insert with check (auth.uid() = user_id);
drop policy if exists payment_modes_update on public.payment_modes;
create policy payment_modes_update on public.payment_modes
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists payment_modes_delete on public.payment_modes;
create policy payment_modes_delete on public.payment_modes
for delete using (auth.uid() = user_id);

-- transactions
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
for select using (auth.uid() = user_id);
drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
for insert with check (auth.uid() = user_id);
drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists transactions_delete on public.transactions;
create policy transactions_delete on public.transactions
for delete using (auth.uid() = user_id);

-- transaction_entries: access via owning transaction (join-based)
drop policy if exists transaction_entries_select on public.transaction_entries;
create policy transaction_entries_select on public.transaction_entries
for select using (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_entries.transaction_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists transaction_entries_insert on public.transaction_entries;
create policy transaction_entries_insert on public.transaction_entries
for insert with check (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_entries.transaction_id
      and t.user_id = auth.uid()
  )
  and exists (
    select 1 from public.accounts a
    where a.id = transaction_entries.account_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists transaction_entries_update on public.transaction_entries;
create policy transaction_entries_update on public.transaction_entries
for update using (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_entries.transaction_id
      and t.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_entries.transaction_id
      and t.user_id = auth.uid()
  )
  and exists (
    select 1 from public.accounts a
    where a.id = transaction_entries.account_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists transaction_entries_delete on public.transaction_entries;
create policy transaction_entries_delete on public.transaction_entries
for delete using (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_entries.transaction_id
      and t.user_id = auth.uid()
  )
);

-- budgets
drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets
for select using (auth.uid() = user_id);
drop policy if exists budgets_insert on public.budgets;
create policy budgets_insert on public.budgets
for insert with check (auth.uid() = user_id);
drop policy if exists budgets_update on public.budgets;
create policy budgets_update on public.budgets
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists budgets_delete on public.budgets;
create policy budgets_delete on public.budgets
for delete using (auth.uid() = user_id);

-- reconciliations
drop policy if exists reconciliations_select on public.reconciliations;
create policy reconciliations_select on public.reconciliations
for select using (auth.uid() = user_id);
drop policy if exists reconciliations_insert on public.reconciliations;
create policy reconciliations_insert on public.reconciliations
for insert with check (auth.uid() = user_id);
drop policy if exists reconciliations_update on public.reconciliations;
create policy reconciliations_update on public.reconciliations
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists reconciliations_delete on public.reconciliations;
create policy reconciliations_delete on public.reconciliations
for delete using (auth.uid() = user_id);

