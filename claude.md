# Finance Tracker - Project Documentation

> Personal finance tracking app with chat-first interface, double-entry bookkeeping, and AI-powered categorization.

## 🏗️ Architecture Overview

### Tech Stack
| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js 16 (App Router) | React framework with server components |
| Styling | Tailwind CSS | Utility-first CSS |
| Database | Supabase (PostgreSQL) | Hosted database with RLS |
| Auth | Supabase Auth | Session-based authentication |
| AI | OpenAI GPT-4o-mini | Transaction categorization |
| Hosting | Vercel (planned) | Serverless deployment |

### Key Design Decisions

1. **Double-Entry Bookkeeping**: Every transaction creates balanced ledger entries (debits = credits)
2. **Integer Cents Storage**: All amounts stored as integers (cents) to avoid floating-point issues
3. **Chat-First Interface**: Natural language input for transactions
4. **Secret Code Login**: Simplified auth for personal use (no signup flow)

---

## 📊 Database Schema

### Account Types
```
checking      → Bank checking accounts
savings       → Savings accounts  
credit_card   → Credit cards (debt)
emergency_fund→ Emergency savings
income        → Internal: counterparty for income
expense       → Internal: counterparty for expenses
friends_owe   → Track money friends owe you
```

### Tables

#### `accounts`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner (FK to auth.users) |
| account_name | text | Display name |
| account_type | enum | One of the types above |
| initial_balance_cents | bigint | Starting balance |
| is_active | boolean | Soft delete flag |

#### `transactions`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| transaction_date | date | When it happened |
| description | text | What it was for |
| amount_cents | bigint | Total amount (always positive) |
| category_id | uuid | FK to categories |
| payment_mode_id | uuid | FK to payment_modes |
| idempotency_key | text | Prevents duplicate submissions |

#### `transaction_entries`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| transaction_id | uuid | Parent transaction |
| account_id | uuid | Which account |
| entry_type | enum | 'debit' or 'credit' |
| amount_cents | bigint | Entry amount |

### Double-Entry Examples

**Expense: $20 groceries on credit card**
```
Debit:  _Expenses     $20  (expense increases)
Credit: Credit Card   $20  (debt increases)
```

**Income: $1000 salary to checking**
```
Debit:  Checking      $1000  (balance increases)
Credit: _Income       $1000  (income recorded)
```

**Transfer: $100 to pay credit card from checking**
```
Debit:  Credit Card   $100  (debt decreases)
Credit: Checking      $100  (balance decreases)
```

**Expense with friend share: $50 dinner, friend owes $25**
```
Debit:  _Expenses       $25  (your share)
Debit:  Friends Owe Me  $25  (they'll pay back)
Credit: Credit Card     $50  (you paid full amount)
```

---

## 🔌 API Endpoints

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | Login with secret code |
| `/auth/logout` | POST | End session |

### Transactions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transactions/parse` | POST | Parse natural language input |
| `/api/transactions/create` | POST | Create transaction with entries |
| `/api/transactions/list` | GET | List recent transactions |
| `/api/transactions/delete` | DELETE | Remove a transaction |

### Accounts
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/accounts/list` | GET | List user accounts (hides internal) |
| `/api/accounts/create` | POST | Add new account |
| `/api/accounts/balances` | GET | Get current balances |
| `/api/accounts/update-balance` | POST | Update initial balance |

### Other
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bootstrap` | POST | Create default accounts/categories |
| `/api/categorize` | POST | AI categorization |
| `/api/analytics` | GET | Dashboard data |
| `/api/system/reset` | POST | Delete all user data |

---

## 🎯 Key Features

### 1. Natural Language Transaction Entry
```
"Spent $23.45 on groceries with apple card"
→ Parses amount, payment method, creates expense

"Paid $100 to credit card from checking"
→ Detects transfer, routes to correct accounts

"$50 dinner, friend will pay half"
→ Splits between personal expense and friends receivable
```

### 2. Account Categories (UI)
The Accounts page shows 3 user-friendly groups:
- 🏦 **Bank Accounts**: Checking, Savings, Emergency Fund
- 💳 **Credit Cards**: All credit_card type accounts
- 🤝 **Friends Owe Me**: Track reimbursements

Internal accounts (`_Income`, `_Expenses`) are hidden from users.

### 3. AI-Powered Categorization
- Uses OpenAI GPT-4o-mini
- Suggests category, payment method, clean description
- Receives account list for intelligent routing
- Falls back to rule-based categorization if AI unavailable

### 4. Idempotency Protection
- Client generates unique key per transaction attempt
- Server checks for existing transaction with same key
- Prevents duplicate entries on retries/flaky connections

---

## 🐛 Known Issues & Fixes

### Issue 1: Supabase Connection Timeouts
**Symptom**: `ConnectTimeoutError`, `fetch failed` in logs
**Cause**: Network latency to Supabase, especially on cold starts
**Fix Applied**:
- Added timeout detection in `apiAuth.ts`
- Returns 503 (Service Unavailable) instead of 401 for timeouts
- Client can distinguish between auth failure and network issues
- UI shows user-friendly error messages for timeouts vs auth failures

### Issue 2: Transfer Account Detection
**Symptom**: 400 error `transfer_requires_both_accounts`
**Cause**: Parser not extracting account names from natural language
**Fix Applied**:
- Improved `extractAccountNames()` in parse route
- Added common credit card name matching (amex, chase, apple card, etc.)
- Default from account to "checking" for card payments
- UI now shows both account dropdowns for transfers

### Issue 3: Internal Accounts Visible in UI
**Symptom**: `_Income`, `_Expenses` showing on Accounts page
**Fix Applied**:
- `/api/accounts/list` now filters out `income` and `expense` types by default
- Can still fetch all with `?includeInternal=true`
- UI groups accounts into Bank/Cards/Friends categories

### Issue 4: Friends Account Type
**Symptom**: "Friends Owe Me" was grouped with Savings
**Fix Applied**:
- Added new `friends_owe` account type to enum
- Bootstrap creates account with correct type
- UI shows dedicated "Friends Owe Me" section

### Issue 5: Poor Error Messages in UI
**Symptom**: Generic "Failed to save transaction" for all errors
**Fix Applied**:
- ChatInterface now detects 503 (timeout), 401 (auth), 400 (validation)
- Shows specific error messages for each case
- ConfirmDrawer shows validation error details from API

---

## 🚀 Setup & Testing

### Prerequisites
1. Node.js 18+
2. Supabase project with:
   - Schema applied (`supabase/schema.sql`)
   - RPC functions applied (`supabase/rpc.sql`)
   - Email confirmation DISABLED (for dev)
   - A user created in Auth dashboard

### Environment Variables (`.env.local`)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...

# Secret code login (your password to access the app)
APP_SECRET_CODE=YourSecretCode123
APP_MASTER_EMAIL=your-user@email.com
APP_MASTER_PASSWORD=SupabaseAuthPassword
```

### Running Locally
```bash
cd FinanceTracker/finance-tracker
npm install
npm run dev
```

### Testing Checklist

#### ✅ Authentication
- [ ] Go to `localhost:3000` → redirects to `/login`
- [ ] Enter wrong secret code → shows error
- [ ] Enter correct secret code → redirects to `/app`

#### ✅ Transaction Entry
- [ ] Type: "Spent $20 on lunch with credit card" → parses correctly
- [ ] Confirm transaction → creates in database
- [ ] Check `/app/transactions` → shows new entry

#### ✅ Transfer
- [ ] Type: "Paid $50 to credit card from checking"
- [ ] Should detect as transfer, show both account dropdowns
- [ ] Confirm → checking decreases, credit card debt decreases

#### ✅ Accounts Page
- [ ] Shows 3 sections: Bank, Credit Cards, Friends
- [ ] Does NOT show `_Income` or `_Expenses`
- [ ] Can add new account
- [ ] Can edit initial balance

#### ✅ Analytics
- [ ] Visit `/app/analytics`
- [ ] Shows charts and summary data

---

## 📁 Project Structure

```
finance-tracker/
├── src/
│   ├── app/
│   │   ├── (root)/           # Landing page
│   │   ├── app/              # Main authenticated area
│   │   │   ├── page.tsx      # Chat interface
│   │   │   ├── accounts/     # Account management
│   │   │   ├── analytics/    # Charts & stats
│   │   │   ├── transactions/ # Transaction history
│   │   │   └── settings/     # Export, reset
│   │   ├── auth/             # Login/logout routes
│   │   ├── login/            # Login page
│   │   └── api/              # API endpoints
│   ├── components/
│   │   ├── accounts/         # AccountsManager
│   │   ├── analytics/        # AnalyticsDashboard
│   │   └── chat/             # ChatInterface
│   └── lib/
│       ├── supabase/         # Client setup
│       ├── apiAuth.ts        # Auth helper
│       ├── money.ts          # Cents ↔ dollars
│       ├── types.ts          # TypeScript types
│       └── offlineQueue.ts   # Offline support
├── supabase/
│   ├── schema.sql            # Database schema
│   └── rpc.sql               # Stored procedures
└── .env.local                # Environment variables
```

---

## 🔒 Security Notes

1. **Row Level Security (RLS)**: All tables have policies ensuring users only see their own data
2. **Service Role Key**: Only used server-side for bootstrap operations
3. **Secret Code Auth**: Simple but effective for single-user personal app
4. **No Sensitive Data in Client**: API keys never exposed to browser

---

## 📈 Future Improvements

- [ ] Offline-first with background sync (currently disabled for testing)
- [ ] Recurring transactions
- [ ] Budget tracking with alerts
- [ ] CSV import from bank statements
- [ ] Mobile PWA with install prompt
- [ ] Multi-currency support

---

*Last updated: January 2026*
