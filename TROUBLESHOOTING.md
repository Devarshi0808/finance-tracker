# Troubleshooting "fetch failed" Error

## Quick Fixes

### 1. Check Environment Variables
```bash
# Verify .env.local exists and has correct values
cat .env.local
```

Should have:
- `NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`

### 2. Verify Supabase Project is Active
- Go to https://supabase.com/dashboard
- Check if your project is paused (free tier pauses after inactivity)
- If paused, click "Restore" to reactivate

### 3. Test Supabase Connection
```bash
# Test if Supabase URL is reachable
curl https://your-project-id.supabase.co/rest/v1/
```

### 4. Clear Next.js Cache
```bash
rm -rf .next
npm run dev
```

### 5. Check Network/Firewall
- Make sure you can reach Supabase from your network
- Check if VPN/proxy is blocking connections

## If Still Failing

The middleware now handles errors gracefully - the app should still load, but authentication won't work until Supabase is reachable.
