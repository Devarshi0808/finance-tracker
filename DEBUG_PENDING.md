# Debug Pending Transaction

## Quick Check

**Open browser console (F12) and check:**

1. **Check localStorage:**
```javascript
// In browser console
JSON.parse(localStorage.getItem('financetracker_pending_v1'))
```

2. **Manually trigger sync:**
```javascript
// In browser console
fetch('/api/transactions/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parsed: JSON.parse(localStorage.getItem('financetracker_pending_v1'))[0].parsed,
    idempotencyKey: JSON.parse(localStorage.getItem('financetracker_pending_v1'))[0].idempotencyKey
  })
}).then(r => r.json()).then(console.log)
```

3. **Clear pending if stuck:**
```javascript
// In browser console - clears all pending
localStorage.removeItem('financetracker_pending_v1')
location.reload()
```

## Why It's Stuck

The transaction is in localStorage but sync is failing because:
- Supabase connection errors (from earlier)
- API route returning error
- Network issue

**You can test everything locally** - just need Supabase to be reachable.
