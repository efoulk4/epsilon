# Security Migration Guide

This guide describes the security fixes implemented and how to deploy them safely.

## Overview

Three critical security vulnerabilities have been fixed:

- **EPS-001 (Critical)**: Tenant Authentication - JWT signature verification
- **EPS-003 (High)**: Arbitrary URL Audit Protection - Authenticated audits only
- **EPS-002 (Medium)**: Token Encryption - Shopify access tokens encrypted at rest

## Pre-Deployment Checklist

### 1. Generate Encryption Key

**CRITICAL**: You must set up an encryption key before deploying.

```bash
# Generate a secure 256-bit encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the output to your environment variables as `ENCRYPTION_KEY`.

### 2. Environment Variables

Ensure these environment variables are set in production:

```bash
# Required - New for EPS-002
ENCRYPTION_KEY=<your-generated-key-from-step-1>

# Required - Existing (verify they're set)
SHOPIFY_API_KEY=<your-shopify-api-key>
SHOPIFY_API_SECRET=<your-shopify-api-secret>
SHOPIFY_APP_URL=<your-app-url>
SHOPIFY_SCOPES=<your-scopes>

# Required for Supabase
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

**Important**:
- Do NOT use the same `ENCRYPTION_KEY` across environments (dev/staging/production)
- Store production keys securely (use Vercel secrets, AWS Secrets Manager, etc.)
- NEVER commit encryption keys to git

### 3. Database Migration for Existing Tokens

If you have existing Shopify sessions stored in `shopify_sessions` table, they contain **plaintext tokens**.

The system provides **automatic backward compatibility**:
- New tokens are encrypted before storage
- Existing plaintext tokens are still readable (decryption skipped for non-encrypted format)
- When a plaintext token is read, a warning is logged

**Recommended Migration Path**:

Option A: **Force Re-Authentication** (Recommended - Most Secure)
```sql
-- Delete all existing sessions to force OAuth re-flow
-- New sessions will be encrypted automatically
TRUNCATE shopify_sessions;
```

Option B: **Manual Migration Script** (If you want to avoid user disruption)
```javascript
// migration/encrypt-existing-tokens.js
const { createClient } = require('@supabase/supabase-js')
const { encrypt } = require('../app/utils/encryption')

async function migrateTokens() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Fetch all sessions
  const { data: sessions, error } = await supabase
    .from('shopify_sessions')
    .select('*')

  if (error) {
    console.error('Failed to fetch sessions:', error)
    return
  }

  for (const session of sessions) {
    // Check if token is already encrypted (has iv:authTag:ciphertext format)
    if (session.access_token.split(':').length === 3) {
      console.log(`Skipping ${session.shop} - already encrypted`)
      continue
    }

    // Encrypt the plaintext token
    const encryptedToken = encrypt(session.access_token)

    // Update the session
    await supabase
      .from('shopify_sessions')
      .update({ access_token: encryptedToken, updated_at: new Date().toISOString() })
      .eq('shop', session.shop)

    console.log(`Encrypted token for ${session.shop}`)
  }

  console.log('Migration complete!')
}

migrateTokens()
```

## Deployment Steps

### Step 1: Set Environment Variables

**On Vercel**:
```bash
vercel env add ENCRYPTION_KEY
# Paste your generated key when prompted
```

**On other platforms**, add to your environment configuration.

### Step 2: Deploy Code

```bash
npm run build
npm run start
# Or deploy to Vercel: vercel --prod
```

### Step 3: Verify Deployment

1. **Test Authentication**:
   - Install the app on a test Shopify store
   - Verify OAuth flow completes successfully
   - Check that session tokens are being verified (check logs for `[getVerifiedShop]`)

2. **Test Encryption**:
   ```sql
   -- Check that new tokens are encrypted (format: iv:authTag:ciphertext)
   SELECT shop, substring(access_token, 1, 50) FROM shopify_sessions;
   -- You should see base64 strings with ':' separators, NOT 'shpat_' prefixes
   ```

3. **Test Audit Protection**:
   - Try to run an audit as an authenticated shop owner - should work
   - Verify arbitrary URL audit UI is removed from the interface

### Step 4: Monitor for Issues

Watch for these log messages:

**Good signs**:
- `[OAuth Callback] Session stored successfully for shop: X`
- `[getShopifySession] Token decryption successful`
- `[runAccessibilityAuditForShop] Auditing verified shop at URL: X`

**Warning signs** (indicate plaintext tokens still exist):
- `[getShopifySession] Found unencrypted token for shop: X - should be re-encrypted`

**Error signs** (require immediate action):
- `ENCRYPTION_KEY environment variable is required`
- `[getShopifySession] Token decryption failed`
- `Unauthorized: No verified shop session`

## Breaking Changes

### For Users

1. **Arbitrary URL Audits Removed**: The manual URL audit feature has been removed from the UI. Users can now only audit their own authenticated Shopify store.

2. **Re-Authentication May Be Required**: If you force-truncate sessions (Option A), all existing users will need to reinstall or re-authenticate the app.

### For Developers

1. **Authentication Changes** (`app/utils/auth.ts`):
   - `getVerifiedShop()` now uses Shopify's official JWT verification
   - Removed `x-shopify-shop-domain` header fallback
   - Always returns `null` on any verification failure (fail-closed)

2. **Audit API Changes** (`app/actions/audit.ts`):
   - `runAccessibilityAudit(url)` is now internal-only (not exported)
   - `runAccessibilityAuditForShop()` requires authentication
   - All audits are automatically saved with tenant (shop) binding

3. **Session Storage** (`app/utils/shopifySession.ts`):
   - `saveShopifySession()` now encrypts tokens before storage
   - `getShopifySession()` now decrypts tokens after retrieval
   - Backward compatible with plaintext tokens (with warning)

## Rollback Plan

If you encounter critical issues:

### Immediate Rollback (Not Recommended - Leaves Vulnerabilities)

```bash
git revert HEAD
vercel --prod
```

### Targeted Fixes

**If encryption is causing issues**:
1. Verify `ENCRYPTION_KEY` is set correctly (32 bytes base64)
2. Check that existing tokens are either migrated or truncated
3. Review logs for decryption errors

**If authentication is failing**:
1. Verify `SHOPIFY_API_SECRET` is correct
2. Check that Shopify session tokens are being sent in `Authorization` header
3. Ensure App Bridge is configured correctly in your frontend

**If audits are failing**:
1. Check rate limiting isn't being hit (`Too many audits`)
2. Verify SSRF protection isn't blocking legitimate Shopify domains
3. Ensure Playwright/Chromium dependencies are installed

## Testing

Run the security regression test suite:

```bash
npm run test:security
```

These tests verify:
- ✅ Forged JWTs are rejected
- ✅ Spoofed headers are rejected
- ✅ Tokens are encrypted with AES-256-GCM
- ✅ Unauthenticated users cannot launch audits
- ✅ Audits are tenant-scoped

## Security Improvements Summary

### EPS-001: Authentication
- **Before**: JWT tokens decoded without signature verification; fallback to unverified headers
- **After**: Cryptographic JWT signature verification using Shopify's official library; fail-closed on errors

### EPS-003: Audit Protection
- **Before**: Any unauthenticated user could launch expensive Playwright browser instances for arbitrary URLs
- **After**: Audits require authenticated Shopify session; only verified shop can be audited; rate limiting enforced

### EPS-002: Token Encryption
- **Before**: Shopify offline access tokens stored as plaintext in database
- **After**: Tokens encrypted with AES-256-GCM before storage; server-side decryption only

## Support

If you encounter issues during migration:

1. Check the logs for specific error messages
2. Verify all environment variables are set correctly
3. Review the test output: `npm run test:security`
4. Check the git diff to understand what changed:
   ```bash
   git diff HEAD~1 app/utils/auth.ts
   git diff HEAD~1 app/utils/encryption.ts
   git diff HEAD~1 app/actions/audit.ts
   ```

## Additional Hardening (Optional)

Consider these additional security measures:

1. **Key Rotation**: Implement periodic `ENCRYPTION_KEY` rotation
   - Generate new key
   - Decrypt all tokens with old key, re-encrypt with new key
   - Update environment variable

2. **Audit Logging**: Log all authentication failures and audit attempts
   ```javascript
   // Already implemented - check logs for:
   // [getVerifiedShop] Verification failed
   // [runAccessibilityAuditForShop] Rate limit exceeded
   ```

3. **Network Policies**: Restrict outbound requests from audit function
   - Already implemented: SSRF protection validates all URLs
   - Consider additional firewall rules if needed

4. **Monitoring**: Set up alerts for:
   - Multiple authentication failures from same IP
   - Rate limit exceeded events
   - Token decryption failures

## References

- Shopify API Documentation: https://shopify.dev/docs/api/admin-rest
- Shopify Session Tokens: https://shopify.dev/docs/apps/auth/oauth/session-tokens
- AES-256-GCM: https://en.wikipedia.org/wiki/Galois/Counter_Mode
- OWASP Top 10: https://owasp.org/www-project-top-ten/
