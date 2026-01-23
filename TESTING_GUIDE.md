# Testing Guide - FinanceTracker

## 🚀 Quick Start

### 1. Prerequisites Check

```bash
# Check Node.js version (should be 18+)
node --version

# Check if dependencies are installed
cd /Users/devarshi8/github/FinanceTracker/finance-tracker
ls node_modules  # Should exist
```

### 2. Environment Variables

Your `.env.local` file should contain:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-proj-... (optional but recommended)
APP_SECRET_CODE=your-secret-code
APP_MASTER_EMAIL=your-email@example.com
APP_MASTER_PASSWORD=your-password
```

**Verify your `.env.local` exists and has all required variables.**

### 3. Start Development Server

```bash
cd /Users/devarshi8/github/FinanceTracker/finance-tracker
npm run dev
```

The app should start at: **http://localhost:3000**

---

## ✅ Testing Checklist

### Phase 1: Authentication & Setup

#### 1.1 Login
- [ ] Navigate to http://localhost:3000
- [ ] Should redirect to `/login`
- [ ] Enter your secret code
- [ ] Should log in and redirect to `/app`

**Expected**: Login page with secret code input, successful login redirects to dashboard

#### 1.2 Initial Bootstrap
- [ ] After first login, check if default accounts are created
- [ ] Go to `/app/accounts`
- [ ] Should see: Checking, Savings, Credit Card, Emergency Fund, _Income, _Expenses, Friends Owe Me

**Expected**: Default accounts automatically created on first use

---

### Phase 2: Core Transaction Features

#### 2.1 Basic Expense Transaction
- [ ] Go to `/app` (Chat page)
- [ ] Type: `Spent $23.45 on groceries with credit card`
- [ ] Click "Send" or press Cmd+Enter
- [ ] Confirm drawer should open
- [ ] Verify:
  - Direction: Expense ✅
  - Amount: $23.45 ✅
  - Description: "groceries" (cleaned) ✅
  - Payment mode: "credit card" ✅
- [ ] Click "Confirm & Save"
- [ ] Should see success message

**Expected**: Transaction parsed correctly, saved successfully

#### 2.2 Income Transaction
- [ ] Type: `Received $2000 paycheck`
- [ ] Confirm drawer should show:
  - Direction: Income ✅
  - Account selector for "Deposit to which account?" ✅
- [ ] Select an account (e.g., Savings)
- [ ] Confirm
- [ ] Check `/app/transactions` - should see the transaction

**Expected**: Income transaction created, deposited to selected account

#### 2.3 Transfer Transaction (Credit Card Payment)
- [ ] Type: `Paid $100 to credit card`
- [ ] Confirm drawer should show:
  - Direction: Transfer ✅
  - "From which account?" selector ✅
  - "To which account?" selector ✅
- [ ] Select:
  - From: Checking
  - To: Credit Card
- [ ] Confirm
- [ ] Check account balances - Credit Card balance should increase (debt decreases)

**Expected**: Transfer correctly moves money between accounts

#### 2.4 Friend Share Transaction
- [ ] Type: `Spent $200 on dinner, $100 is for my friend`
- [ ] Confirm drawer should show:
  - Friend checkbox: checked ✅
  - Friend share: $100 ✅
- [ ] Confirm
- [ ] Check `/app/accounts` - "Friends Owe Me" balance should be $100

**Expected**: Friend share tracked correctly

#### 2.5 AI Categorization
- [ ] Type: `Spent $50 on Uber ride`
- [ ] Should auto-suggest:
  - Category: Transportation ✅
  - Payment mode: (if account matches) ✅
- [ ] Type: `Spent $30 on Netflix subscription`
- [ ] Should suggest: Recreational ✅

**Expected**: AI suggests appropriate categories and payment methods

---

### Phase 3: Account Management

#### 3.1 View Accounts
- [ ] Go to `/app/accounts`
- [ ] Should see all accounts with:
  - Initial balance
  - Current balance (initial + transactions)
- [ ] Verify balances are correct

**Expected**: All accounts listed with accurate balances

#### 3.2 Create New Account
- [ ] Click "Add Account"
- [ ] Fill in:
  - Name: "Apple Card"
  - Type: Credit Card
  - Initial Balance: -$500 (if you owe money)
- [ ] Save
- [ ] Should appear in accounts list

**Expected**: New account created successfully

#### 3.3 Update Account Balance
- [ ] Click "Edit" on an account
- [ ] Change initial balance
- [ ] Save
- [ ] Current balance should update

**Expected**: Balance updates correctly

---

### Phase 4: Analytics

#### 4.1 View Analytics
- [ ] Go to `/app/analytics`
- [ ] Should see:
  - Summary cards (Income, Expenses, Net Income, Friends Owe Me) ✅
  - Income vs Expenses chart ✅
  - Account balances overview ✅
  - Category spending breakdown ✅
  - Necessary vs Unnecessary expenses ✅
- [ ] Change month using month selector
- [ ] Data should update

**Expected**: Analytics display correctly for current month

---

### Phase 5: Offline Functionality

#### 5.1 Offline Transaction
- [ ] Open browser DevTools → Network tab
- [ ] Set to "Offline" mode
- [ ] Create a transaction: `Spent $15 on coffee`
- [ ] Should see "pending transactions" indicator
- [ ] Transaction should be queued locally
- [ ] Set network back to "Online"
- [ ] Should see "Synced X offline transactions!" message
- [ ] Check `/app/transactions` - transaction should appear

**Expected**: Offline transactions queue and sync automatically

#### 5.2 Multiple Offline Transactions
- [ ] Go offline
- [ ] Create 3 transactions
- [ ] Go online
- [ ] All 3 should sync
- [ ] No duplicates should be created

**Expected**: All offline transactions sync without duplicates

---

### Phase 6: Edge Cases & Error Handling

#### 6.1 Invalid Input
- [ ] Type: `Spent money` (no amount)
- [ ] Should show error: "Couldn't parse that"

**Expected**: Graceful error handling

#### 6.2 Transfer Without Accounts
- [ ] Type: `Transfer $50` (no account selection)
- [ ] Confirm drawer should require both accounts
- [ ] Try to save without selecting accounts
- [ ] Should show error: "Please select both the source and destination accounts"

**Expected**: Validation prevents invalid transfers

#### 6.3 Large Amount
- [ ] Type: `Spent $999999 on test`
- [ ] Should accept (no limit currently, but should work)

**Expected**: Large amounts handled correctly

---

### Phase 7: Data Integrity

#### 7.1 Double-Entry Validation
- [ ] Create a transaction
- [ ] Check database (via Supabase dashboard):
  - Transaction should have 2+ entries
  - Sum of debits = Sum of credits ✅
- [ ] Try to manually create unbalanced transaction (should fail)

**Expected**: Database constraints prevent unbalanced transactions

#### 7.2 Account Balance Calculation
- [ ] Create several transactions
- [ ] Go to `/app/accounts`
- [ ] Verify: Current Balance = Initial Balance + Sum(Debits) - Sum(Credits)

**Expected**: Balance calculations are accurate

---

### Phase 8: Settings & Export

#### 8.1 CSV Export
- [ ] Go to `/app/settings`
- [ ] Click "Download transactions.csv"
- [ ] Should download CSV file
- [ ] Open CSV - should contain all transactions

**Expected**: CSV export works correctly

#### 8.2 System Reset
- [ ] Go to `/app/settings`
- [ ] Scroll to "Danger Zone"
- [ ] Click "Reset System"
- [ ] Type: `RESET ALL DATA`
- [ ] Confirm
- [ ] All transactions should be deleted
- [ ] Accounts should remain

**Expected**: Reset deletes transactions but keeps accounts

---

## 🐛 Common Issues & Fixes

### Issue: "Authentication failed"
**Fix**: 
- Check `.env.local` has correct Supabase keys
- Verify secret code matches `APP_SECRET_CODE`
- Clear browser cookies and try again

### Issue: "Missing accounts" error
**Fix**:
- Go to `/app/accounts` - bootstrap should run automatically
- Or manually call `/api/bootstrap` endpoint

### Issue: Transactions not syncing offline
**Fix**:
- Check browser localStorage: `financetracker_pending_v1`
- Verify network is actually online
- Check browser console for errors

### Issue: "Cannot read property of undefined"
**Fix**:
- Clear `.next` folder: `rm -rf .next`
- Restart dev server
- Check all environment variables are set

### Issue: AI categorization not working
**Fix**:
- Check `OPENAI_API_KEY` is set in `.env.local`
- Verify API key is valid
- Check browser console for errors
- Should fall back to rule-based categorization

---

## 📊 Test Data Suggestions

### Create Test Transactions:
1. `Spent $50 on groceries with credit card`
2. `Received $3000 paycheck` → Deposit to Savings
3. `Paid $200 to credit card` → Transfer from Checking to Credit Card
4. `Spent $80 on dinner, split half with friend` → Friend share $40
5. `Spent $25 on Uber ride`
6. `Spent $15 on Netflix subscription`

### Expected Results:
- Credit Card balance should reflect purchases and payments
- Friends Owe Me should show $40
- Analytics should show category breakdowns
- Account balances should be accurate

---

## 🔍 Verification Commands

### Check Database (Supabase Dashboard):
```sql
-- Check transactions
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;

-- Check transaction entries (should balance)
SELECT 
  t.id,
  t.description,
  SUM(CASE WHEN te.entry_type = 'debit' THEN te.amount_cents ELSE 0 END) as total_debits,
  SUM(CASE WHEN te.entry_type = 'credit' THEN te.amount_cents ELSE 0 END) as total_credits
FROM transactions t
LEFT JOIN transaction_entries te ON t.id = te.transaction_id
GROUP BY t.id
HAVING SUM(CASE WHEN te.entry_type = 'debit' THEN te.amount_cents ELSE 0 END) 
    != SUM(CASE WHEN te.entry_type = 'credit' THEN te.amount_cents ELSE 0 END);
-- Should return 0 rows (all transactions balanced)

-- Check account balances
SELECT 
  a.account_name,
  a.initial_balance_cents,
  SUM(CASE WHEN te.entry_type = 'debit' THEN te.amount_cents ELSE -te.amount_cents END) as ledger_change,
  a.initial_balance_cents + COALESCE(SUM(CASE WHEN te.entry_type = 'debit' THEN te.amount_cents ELSE -te.amount_cents END), 0) as current_balance
FROM accounts a
LEFT JOIN transaction_entries te ON a.id = te.account_id
GROUP BY a.id, a.account_name, a.initial_balance_cents;
```

---

## ✅ Success Criteria

Your app is working correctly if:
- ✅ Can log in with secret code
- ✅ Can create expense, income, and transfer transactions
- ✅ Account balances update correctly
- ✅ Friend shares tracked in "Friends Owe Me" account
- ✅ Analytics show correct data
- ✅ Offline transactions queue and sync
- ✅ No duplicate transactions on retry
- ✅ CSV export works
- ✅ All transactions are balanced (debits = credits)

---

## 🚨 If Something Breaks

1. **Check browser console** for errors
2. **Check terminal** where `npm run dev` is running
3. **Check Supabase logs** in dashboard
4. **Verify environment variables** are set correctly
5. **Clear Next.js cache**: `rm -rf .next && npm run dev`
6. **Check database** - verify RLS policies are active
7. **Review error messages** - they should guide you to the issue

---

## 📝 Next Steps After Testing

Once everything works:
1. ✅ Test on mobile browser
2. ✅ Test with real financial data
3. ✅ Set up proper account balances
4. ✅ Configure categories to match your needs
5. ✅ Deploy to Vercel (when ready)
