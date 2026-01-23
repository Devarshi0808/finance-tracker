# Quick Start

## 1. Install Dependencies (if needed)
```bash
cd /Users/devarshi8/github/FinanceTracker/finance-tracker
npm install
```

## 2. Check Environment Variables
```bash
# Make sure .env.local exists with:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - OPENAI_API_KEY (optional)
# - APP_SECRET_CODE
# - APP_MASTER_EMAIL
# - APP_MASTER_PASSWORD
```

## 3. Start Dev Server
```bash
npm run dev
```

## 4. Open Browser
```
http://localhost:3000
```

## 5. Test Basic Flow
1. Login with your secret code
2. Go to `/app` (Chat page)
3. Type: `Spent $23.45 on groceries with credit card`
4. Confirm and save
5. Check `/app/transactions` - should see the transaction
6. Check `/app/accounts` - balances should update
7. Check `/app/analytics` - should show spending breakdown

## 6. Test Transfer
Type: `Paid $100 to credit card`
- Select "From: Checking" and "To: Credit Card"
- Confirm
- Credit card balance should increase (debt decreases)

## 7. Test Offline
1. Open DevTools → Network → Offline
2. Create transaction: `Spent $15 on coffee`
3. Should see "pending" indicator
4. Go back online
5. Should sync automatically

Done! 🎉
