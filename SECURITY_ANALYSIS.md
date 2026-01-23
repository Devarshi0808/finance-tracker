# Security Analysis: Breakpoints & Vulnerabilities

## 🔴 Critical Breakpoints (Single Points of Failure)

### 1. **Supabase Dependency**
**Location**: All API routes, database operations

**Risk**: If Supabase is down or unreachable, the entire application fails.

**Impact**: 
- ❌ Cannot create transactions
- ❌ Cannot view accounts
- ❌ Cannot access any data
- ✅ Offline queue provides temporary resilience

**Mitigation**: 
- ✅ Offline queue stores transactions locally
- ⚠️ No fallback database
- ⚠️ No read-only mode

**Status**: **Acceptable for personal use** - Supabase has high uptime SLA

---

### 2. **Environment Variables Missing**
**Location**: `middleware.ts:8-9`, all API routes

**Risk**: If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, app crashes.

**Current Behavior**: 
- Uses `!` assertion (crashes if undefined)
- No graceful degradation

**Impact**: Application won't start

**Fix Needed**:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Return error page instead of crashing
  return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
}
```

---

### 3. **OpenAI API Dependency**
**Location**: `src/app/api/categorize/route.ts`

**Risk**: If OpenAI API is down or rate-limited, categorization fails.

**Current Behavior**: ✅ Falls back to rule-based categorization

**Impact**: 
- ✅ Graceful degradation (rule-based fallback)
- ⚠️ Less accurate categorization

**Status**: **Well handled** - Has fallback mechanism

---

### 4. **Bootstrap Dependency**
**Location**: `src/app/api/transactions/create/route.ts:62-73`

**Risk**: If bootstrap fails, required accounts might not exist.

**Current Behavior**: 
- ⚠️ Non-blocking (continues even if bootstrap fails)
- ⚠️ Transaction creation will fail if accounts don't exist

**Impact**: Transaction creation fails with "missing_accounts" error

**Status**: **Partially handled** - Should check if accounts exist before proceeding

---

## 🔴 Critical Vulnerabilities

### 1. **Middleware Allows All `/api` Routes Without Auth Check**
**Location**: `src/middleware.ts:33`

**Vulnerability**: 
```typescript
const isPublicRoute =
  pathname === "/" ||
  isAuthRoute ||
  pathname.startsWith("/api") ||  // ⚠️ ALL API routes are public!
  pathname.startsWith("/auth");
```

**Risk**: 
- ❌ If an API route forgets to check auth, it's accessible to anyone
- ❌ Relies on each route implementing `requireAuth()` manually
- ❌ No defense in depth

**Impact**: Unauthenticated users could potentially access data if a route is misconfigured

**Fix Needed**: Remove `/api` from public routes, add explicit allowlist:
```typescript
const publicApiRoutes = ["/api/bootstrap"]; // Only bootstrap should be public
const isPublicRoute =
  pathname === "/" ||
  isAuthRoute ||
  (pathname.startsWith("/api") && publicApiRoutes.includes(pathname)) ||
  pathname.startsWith("/auth");
```

**Status**: ⚠️ **HIGH RISK** - Defense in depth missing

---

### 2. **Missing Authentication in Some Routes**
**Location**: Multiple API routes

**Routes Missing `requireAuth()`**:
- ❌ `src/app/api/accounts/list/route.ts` - Uses `auth.getUser()` directly (less consistent)
- ❌ `src/app/api/accounts/balances/route.ts` - Uses `auth.getUser()` directly
- ❌ `src/app/api/transactions/list/route.ts` - Uses `auth.getUser()` directly
- ❌ `src/app/api/export/transactions/route.ts` - Uses `auth.getUser()` directly
- ❌ `src/app/api/analytics/route.ts` - Uses `auth.getUser()` directly

**Risk**: 
- Inconsistent error handling
- Less maintainable
- But still protected by RLS ✅

**Impact**: **Low** - RLS protects data, but inconsistent patterns

**Recommendation**: Standardize all routes to use `requireAuth()`

---

### 3. **No Rate Limiting**
**Location**: All API routes

**Vulnerability**: No protection against:
- Brute force attacks on login
- API abuse / DoS
- Cost attacks (OpenAI API calls)

**Impact**: 
- ❌ Attacker could spam login attempts
- ❌ Attacker could exhaust OpenAI API quota
- ❌ Attacker could create thousands of transactions

**Fix Needed**: Add rate limiting middleware:
```typescript
// Example using next-rate-limit or similar
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
```

**Status**: ⚠️ **MEDIUM RISK** - For personal use, lower priority

---

### 4. **Error Messages Leak Information**
**Location**: Multiple API routes

**Examples**:
- `src/app/api/transactions/create/route.ts:192` - Returns `rpcError.message` which might contain SQL details
- `src/app/api/accounts/list/route.ts:17` - Returns `error.message` with DB details
- `src/lib/apiAuth.ts:27` - Logs auth errors to console

**Risk**: 
- Error messages might reveal:
  - Database structure
  - Internal implementation details
  - Account existence (timing attacks)

**Impact**: **Low-Medium** - Information disclosure

**Fix Needed**: Sanitize error messages:
```typescript
if (rpcError) {
  console.error("RPC error:", rpcError.message); // Log full error server-side
  return NextResponse.json({ 
    error: "transaction_creation_failed" // Generic error for client
  }, { status: 500 });
}
```

---

### 5. **No CSRF Protection**
**Location**: All POST/PUT/DELETE routes

**Vulnerability**: No CSRF tokens or SameSite cookie protection

**Risk**: 
- If user is logged in and visits malicious site, that site could make requests
- Supabase cookies might be vulnerable

**Impact**: **Low** - Supabase handles session management, but explicit protection is better

**Fix Needed**: 
- Ensure Supabase cookies have `SameSite=Strict`
- Add CSRF tokens for state-changing operations

**Status**: ⚠️ **LOW-MEDIUM RISK** - Supabase provides some protection

---

### 6. **Secret Code Authentication**
**Location**: `src/app/auth/login/route.ts`

**Vulnerability**: 
- Single secret code for all access
- Stored in environment variable (could be exposed)
- No rate limiting on login attempts

**Risk**: 
- If secret code is leaked, anyone can access
- Brute force possible (no rate limiting)

**Impact**: **HIGH** - Complete system compromise if secret leaked

**Mitigation**: 
- ✅ Environment variable (not in code)
- ⚠️ Should add rate limiting
- ⚠️ Should add logging of login attempts
- ⚠️ Consider 2FA for production

**Status**: ⚠️ **ACCEPTABLE FOR PERSONAL USE** - But should improve for production

---

### 7. **No Input Sanitization for XSS**
**Location**: User-provided text fields (description, account names, etc.)

**Vulnerability**: 
- User input stored directly in database
- Rendered in UI without sanitization
- React escapes by default, but not guaranteed

**Risk**: 
- XSS if React doesn't escape properly
- Stored XSS in transaction descriptions

**Impact**: **Low** - React auto-escapes, but explicit sanitization is better

**Fix Needed**: 
```typescript
import DOMPurify from 'isomorphic-dompurify';

const sanitized = DOMPurify.sanitize(userInput);
```

**Status**: ⚠️ **LOW RISK** - React provides protection, but explicit is better

---

### 8. **Console.error Logs Sensitive Data**
**Location**: Multiple files

**Examples**:
- `src/lib/apiAuth.ts:27` - Logs auth errors
- `src/app/api/transactions/create/route.ts:68` - Logs bootstrap errors

**Risk**: 
- Error logs might contain:
  - User IDs
  - Account IDs
  - Transaction details
  - Stack traces

**Impact**: **Low** - Only visible server-side, but should sanitize

**Fix Needed**: Sanitize logs:
```typescript
console.error("Auth error:", error.message); // OK
console.error("User:", user.id); // ⚠️ Don't log user IDs
```

---

### 9. **No Request Size Limits**
**Location**: All POST routes

**Vulnerability**: No limit on request body size

**Risk**: 
- Attacker could send huge payloads
- Could cause memory issues
- Could exhaust server resources

**Impact**: **Low** - Next.js has default limits, but explicit is better

**Fix Needed**: Add body size limits in Next.js config

---

### 10. **RLS Policy Gaps**
**Location**: `supabase/schema.sql`

**Analysis**: 
- ✅ All tables have RLS enabled
- ✅ All policies check `auth.uid() = user_id`
- ✅ Transaction entries protected via join with transactions
- ⚠️ No policy for `budgets` table (line 216 enabled but no policies shown)

**Risk**: If RLS policies are misconfigured, users could access other users' data

**Impact**: **CRITICAL** - But appears well-configured ✅

**Status**: ✅ **WELL PROTECTED** - RLS policies look correct

---

## 🟡 Medium Priority Issues

### 11. **Idempotency Key Validation**
**Location**: `src/app/api/transactions/create/route.ts:41-59`

**Issue**: No validation on idempotency key format/length

**Risk**: 
- Attacker could send extremely long keys
- Could cause database issues

**Impact**: **Low** - Database constraint limits length

**Fix Needed**: Validate key format:
```typescript
if (clientKey && (clientKey.length > 255 || !/^[a-zA-Z0-9_-]+$/.test(clientKey))) {
  return NextResponse.json({ error: "invalid_idempotency_key" }, { status: 400 });
}
```

---

### 12. **No Transaction Limits**
**Location**: Transaction creation

**Issue**: No limit on transaction amount or frequency

**Risk**: 
- User could accidentally create huge transactions
- No protection against typos (e.g., $1000000 instead of $100)

**Impact**: **Low** - User's own data, but could be annoying

**Fix Needed**: Add reasonable limits:
```typescript
if (amountCents > 100_000_000) { // $1,000,000
  return NextResponse.json({ error: "amount_too_large" }, { status: 400 });
}
```

---

### 13. **Account Name Injection**
**Location**: Account creation, transaction parsing

**Issue**: Account names used in string matching without sanitization

**Risk**: 
- Special characters in account names could break matching logic
- SQL injection (but Supabase protects against this)

**Impact**: **Very Low** - Supabase parameterized queries protect

---

## 🟢 Low Priority / Best Practices

### 14. **No Request Logging**
**Issue**: No audit trail of API requests

**Impact**: **Low** - Harder to debug issues or detect abuse

**Recommendation**: Add request logging middleware

---

### 15. **No Health Check Endpoint**
**Issue**: No way to check if API is healthy

**Impact**: **Low** - Monitoring tools can't check health

**Recommendation**: Add `/api/health` endpoint

---

## ✅ Well-Protected Areas

1. ✅ **SQL Injection**: Supabase uses parameterized queries
2. ✅ **Authentication**: Supabase handles session management
3. ✅ **Data Isolation**: RLS policies ensure users only see their data
4. ✅ **Input Validation**: Zod schemas validate all inputs
5. ✅ **Type Safety**: TypeScript prevents many errors
6. ✅ **Double-Entry Validation**: Database constraints ensure balance

---

## 📊 Risk Summary

| Vulnerability | Severity | Likelihood | Impact | Priority |
|--------------|----------|------------|--------|----------|
| Middleware allows all /api routes | 🔴 High | Medium | High | **FIX NOW** |
| No rate limiting | 🟡 Medium | Low | Medium | Fix Soon |
| Error messages leak info | 🟡 Medium | Low | Low | Fix Soon |
| Secret code auth | 🟡 Medium | Low | High | Acceptable for personal use |
| Missing auth standardization | 🟢 Low | Low | Low | Nice to have |
| No CSRF protection | 🟢 Low | Very Low | Medium | Nice to have |
| No input sanitization | 🟢 Low | Very Low | Low | Nice to have |

---

## 🚀 Recommended Immediate Fixes

### Priority 1: Fix Middleware (Critical)
```typescript
// src/middleware.ts
const publicApiRoutes = ["/api/bootstrap"]; // Only bootstrap should be public
const isPublicRoute =
  pathname === "/" ||
  isAuthRoute ||
  (pathname.startsWith("/api") && publicApiRoutes.includes(pathname)) ||
  pathname.startsWith("/auth");
```

### Priority 2: Add Rate Limiting
Install and configure rate limiting for login and API routes.

### Priority 3: Sanitize Error Messages
Don't expose internal error details to clients.

### Priority 4: Standardize Auth
Use `requireAuth()` consistently across all routes.

---

## 🎯 Conclusion

**Overall Security Posture**: **Good for personal use, needs improvements for production**

**Strengths**:
- ✅ RLS policies protect data
- ✅ Supabase handles authentication
- ✅ Input validation with Zod
- ✅ Type safety with TypeScript

**Weaknesses**:
- ⚠️ Middleware allows all API routes
- ⚠️ No rate limiting
- ⚠️ Error messages too verbose
- ⚠️ Secret code auth (acceptable for personal use)

**For Production**: Add rate limiting, CSRF protection, and fix middleware before deploying publicly.
