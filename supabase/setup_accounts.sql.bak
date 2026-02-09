-- ============================================
-- FINANCE TRACKER - ACCOUNT SETUP SCRIPT
-- ============================================
-- Run this in Supabase SQL Editor AFTER schema.sql and rpc.sql
-- You must be logged in OR replace auth.uid() with your actual user_id

-- Step 1: Get your user_id (run this first to verify)
-- SELECT auth.uid();

-- ============================================
-- STEP 2: DELETE ALL EXISTING DATA (FRESH START)
-- ============================================
-- Delete in correct order due to foreign keys

DELETE FROM transaction_entries
WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = auth.uid());

DELETE FROM transactions WHERE user_id = auth.uid();

DELETE FROM budgets WHERE user_id = auth.uid();

DELETE FROM reconciliations WHERE user_id = auth.uid();

DELETE FROM accounts WHERE user_id = auth.uid();

DELETE FROM categories WHERE user_id = auth.uid();

DELETE FROM payment_modes WHERE user_id = auth.uid();

-- ============================================
-- STEP 3: CREATE YOUR ACCOUNTS
-- ============================================
-- UPDATE THE NUMBERS BELOW TO YOUR ACTUAL BALANCES
-- Remember: amounts are in CENTS (e.g., $1000.00 = 100000)

-- Bank Accounts (Assets - positive = money you have)
INSERT INTO accounts (user_id, account_name, account_type, initial_balance_cents, is_active) VALUES
  (auth.uid(), 'SoFi Savings', 'savings', 0, true),        -- e.g., $5000 = 500000
  (auth.uid(), 'SoFi Checking', 'checking', 0, true),      -- e.g., $2000 = 200000
  (auth.uid(), 'Chase Savings', 'savings', 0, true),
  (auth.uid(), 'Chase Checking', 'checking', 0, true);

-- Credit Cards (Liabilities - NEGATIVE = debt you owe)
-- If you owe $500 on a card, set initial_balance_cents = -50000
INSERT INTO accounts (user_id, account_name, account_type, initial_balance_cents, is_active) VALUES
  (auth.uid(), 'Chase Freedom', 'credit_card', 0, true),   -- e.g., owe $500 = -50000
  (auth.uid(), 'Apple Card', 'credit_card', 0, true),
  (auth.uid(), 'Discover it', 'credit_card', 0, true),
  (auth.uid(), 'Amex Gold', 'credit_card', 0, true);

-- System Accounts (Required - DO NOT MODIFY THESE)
INSERT INTO accounts (user_id, account_name, account_type, initial_balance_cents, is_active) VALUES
  (auth.uid(), '_Income', 'income', 0, true),
  (auth.uid(), '_Expenses', 'expense', 0, true),
  (auth.uid(), 'Friends Owe Me', 'friends_owe', 0, true);

-- ============================================
-- STEP 4: CREATE CATEGORIES
-- ============================================
-- is_necessary = true for essential expenses, false for discretionary
INSERT INTO categories (user_id, name, type, is_necessary) VALUES
  (auth.uid(), 'Income', 'income', true),
  (auth.uid(), 'Transportation', 'expense', true),
  (auth.uid(), 'Personal', 'expense', false),
  (auth.uid(), 'Household', 'expense', true),
  (auth.uid(), 'Recreational', 'expense', false),
  (auth.uid(), 'Savings', 'savings', true),
  (auth.uid(), 'Food & Dining', 'expense', true),
  (auth.uid(), 'Utilities', 'expense', true),
  (auth.uid(), 'Healthcare', 'expense', true),
  (auth.uid(), 'Shopping', 'expense', false),
  (auth.uid(), 'Entertainment', 'expense', false);

-- ============================================
-- STEP 5: CREATE PAYMENT MODES
-- ============================================
INSERT INTO payment_modes (user_id, name) VALUES
  (auth.uid(), 'cash'),
  (auth.uid(), 'debit card'),
  (auth.uid(), 'credit card'),
  (auth.uid(), 'zelle'),
  (auth.uid(), 'bank transfer');

-- ============================================
-- VERIFY: Check your accounts were created
-- ============================================
SELECT
  account_name,
  account_type,
  initial_balance_cents / 100.0 as initial_balance_dollars
FROM accounts
WHERE user_id = auth.uid()
ORDER BY account_type, account_name;
