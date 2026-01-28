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
| Hosting | Vercel | Serverless deployment |

### Key Design Decisions

1. **Double-Entry Bookkeeping**: Every transaction creates balanced ledger entries (debits = credits)
2. **Integer Cents Storage**: All amounts stored as integers (cents) to avoid floating-point issues
3. **Chat-First Interface**: Natural language input for transactions
4. **Secret Code Login**: Simplified auth for personal use (no signup flow)
5. **Direction Derivation**: Transaction direction (income/expense/transfer) is derived from ledger entries, not stored

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
| merchant | text | (New) Merchant name |
| status | text | (New) completed/pending/failed/recurring |
| reference_id | text | (New) External reference |
| idempotency_key | text | Prevents duplicate submissions |

#### `transaction_entries`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| transaction_id | uuid | Parent transaction |
| account_id | uuid | Which account |
| entry_type | enum | 'debit' or 'credit' |
| amount_cents | bigint | Entry amount |

#### `categories`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| name | text | Category name |
| type | text | income/expense/savings |
| is_necessary | boolean | For budget tracking |

#### `budgets`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| category_id | uuid | FK to categories |
| month | date | YYYY-MM-01 format |
| budget_amount_cents | bigint | Monthly budget |

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
| `/api/transactions/list` | GET | List with filters, pagination, direction |
| `/api/transactions/update` | PATCH | Update transaction fields |
| `/api/transactions/delete` | DELETE | Remove a transaction |

### Accounts
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/accounts/list` | GET | List user accounts (hides internal) |
| `/api/accounts/create` | POST | Add new account |
| `/api/accounts/balances` | GET | Get current balances |
| `/api/accounts/update-balance` | POST | Update initial balance |

### Budgets
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/budgets/list` | GET | List budgets with spent calculations |
| `/api/budgets/set` | POST | Create/update budget for category |

### Other
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bootstrap` | POST | Create default accounts/categories |
| `/api/categorize` | POST | AI categorization |
| `/api/categories/list` | GET | List categories |
| `/api/analytics` | GET | Dashboard data with direction derivation |
| `/api/system/reset` | POST | Delete all user data |
| `/api/export/transactions` | GET | Download CSV export |

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

### 4. Transaction Management
- Rich transaction list with filters (date, category, direction, search)
- Pagination support
- Edit/delete transactions
- Direction derived from ledger entries

### 5. Budget Tracking
- Monthly budget management with progress bars
- Category-based budgets with spent calculations
- Month navigation (prev/next)
- Visual indicators for overspending

### 6. Rate Limiting
- In-memory rate limiting for API endpoints
- Configurable limits per endpoint type
- Protects against abuse

---

## 🎨 Design Theme

**Color Palette**: Black/white/grey with Purple-500 accent

```css
:root {
  --primary: #8B5CF6;        /* Purple-500 */
  --primary-hover: #7C3AED;  /* Purple-600 */
  --primary-light: #A78BFA;  /* Purple-400 */
}
```

---

## 🚀 Setup & Deployment

### Prerequisites
1. Node.js 18+
2. Supabase project with:
   - Schema applied (`supabase/schema.sql`)
   - RPC functions applied (`supabase/rpc.sql`)
   - Email confirmation DISABLED (for dev)
   - A user created in Auth dashboard

### Environment Variables
Copy `.env.example` to `.env.local` and fill in:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
APP_SECRET_CODE=your-login-secret
APP_MASTER_EMAIL=your-email@example.com
APP_MASTER_PASSWORD=your-supabase-auth-password
```

### Database Migration
Run in Supabase SQL Editor:
```sql
-- Add new transaction fields
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_id text;

-- Add status constraint
DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('completed', 'pending', 'failed', 'recurring'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(user_id, merchant) WHERE merchant IS NOT NULL;
```

### Running Locally
```bash
npm install
npm run dev
```

### Vercel Deployment
1. Push to GitHub
2. Connect repo to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

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
│   │   │   ├── budgets/      # Budget management
│   │   │   ├── transactions/ # Transaction history
│   │   │   └── settings/     # Export, reset
│   │   ├── auth/             # Login/logout routes
│   │   ├── login/            # Login page
│   │   └── api/              # API endpoints
│   ├── components/
│   │   ├── accounts/         # AccountsManager
│   │   ├── analytics/        # AnalyticsDashboard
│   │   ├── budgets/          # BudgetManager
│   │   ├── chat/             # ChatInterface
│   │   ├── system/           # SystemReset
│   │   └── transactions/     # TransactionList
│   └── lib/
│       ├── supabase/         # Client setup
│       ├── apiAuth.ts        # Auth helper
│       ├── errorHandler.ts   # Error sanitization
│       ├── rateLimit.ts      # Rate limiting
│       ├── money.ts          # Cents ↔ dollars
│       └── types.ts          # TypeScript types
├── supabase/
│   ├── schema.sql            # Database schema
│   ├── rpc.sql               # Stored procedures
│   ├── setup_accounts.sql    # Account setup script
│   └── migrations/           # SQL migrations
├── .env.example              # Environment template
└── CLAUDE.md                 # This documentation
```

---

## 🔒 Security

1. **Row Level Security (RLS)**: All tables have policies ensuring users only see their own data
2. **Service Role Key**: Only used server-side for bootstrap operations
3. **Secret Code Auth**: Simple but effective for single-user personal app
4. **No Sensitive Data in Client**: API keys never exposed to browser
5. **Rate Limiting**: Protects API endpoints from abuse
6. **Error Sanitization**: Database errors are sanitized before returning to client

---

## 🐛 Recent Fixes (January 2026)

1. **Analytics Direction Bug**: Fixed - direction is now derived from transaction_entries
2. **Balance Calculation**: Fixed - credit cards use inverted calculation (credits increase debt)
3. **Dead Code Removal**: Removed offlineQueue.ts, signup routes
4. **Theme Update**: Changed from blue (#0071e3) to purple (#8B5CF6) accent
5. **Enhanced APIs**: Added filters, pagination, direction to transactions list
6. **Budget Management**: Full CRUD with spent calculations and progress bars
7. **Mobile-Responsive Design**: All pages now work on mobile with hamburger menu
8. **Lint Cleanup**: Fixed all ESLint errors, removed unused imports/variables
9. **Production Hardening**: Rate limiting, error sanitization, env validation

---

## ✅ Production Checklist

- [x] Build passes (`npm run build`)
- [x] No lint errors (`npm run lint`)
- [x] All env vars documented in `.env.example`
- [x] Rate limiting on all API endpoints
- [x] Error sanitization (no sensitive data in responses)
- [x] Secret code authentication working
- [x] Mobile-responsive design
- [x] Purple theme consistently applied

---

*Last updated: January 2026*
