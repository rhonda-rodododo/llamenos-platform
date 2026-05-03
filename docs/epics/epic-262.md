# Epic 262: Worker Medium Security Fixes

## Summary
Fix 12 medium-severity Worker vulnerabilities from Audit Round 8: legacy plaintext contacts (M9), provisioning rate limiting (M10), debug endpoint exposure (M11), setup state leakage (M12), hub settings validation (M13), CORS allowlist (M14), audit actorPubkey validation (M15), blast rate enforcement (M16), preference token timing (M17), upload size limits (M19), and dev reset endpoint default (M33).

## Context
- **Audit Round**: 8 (March 2026)
- **Severity**: All Medium/Important
- Defense-in-depth issues reducing attack surface

## Implementation

### M9: Legacy Plaintext Contact Migration
```typescript
export function migrateContactIfNeeded(stored: string, hmacSecret: string): {
  value: string; needsUpdate: boolean
} {
  if (!stored.startsWith('enc:')) {
    return { value: stored, needsUpdate: true }
  }
  return { value: decryptContactIdentifier(stored, hmacSecret), needsUpdate: false }
}
```
DOs that read contacts add lazy migration: if `needsUpdate`, re-encrypt and write back.

### M10: Rate Limit Provisioning Polling
```typescript
provisioning.get('/rooms/:id', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  const rl = await checkRateLimit(c.env, `provision:${ip}`, 30)
  if (!rl.allowed) return c.json({ error: 'Rate limited' }, 429)
  // ... existing logic
})
```

### M11: Gate Debug Endpoint
```typescript
calls.get('/debug', requirePermission('audit:read'), async (c) => { ... })
```

### M12: Gate Setup State on Permission
```typescript
setup.get('/state', requirePermission('settings:manage'), async (c) => { ... })
```

### M13: Validate Hub Settings
```typescript
const ALLOWED_HUB_SETTINGS = new Set([
  'hubName', 'timezone', 'language', 'welcomeMessage',
  'emergencyMessage', 'maxConcurrentCalls', 'nostrRelayUrl',
])
// Strip unknown keys before merge
```

### M14: CORS Explicit Allowlist
```typescript
const ALLOWED_ORIGINS = new Set([
  'https://app.llamenos.org',
  'https://demo.llamenos-platform.com',
  'tauri://localhost',
  'https://tauri.localhost',
])
```

### M15: Validate Audit actorPubkey
```typescript
if (data.actorPubkey !== 'system' && !/^[0-9a-f]{64}$/.test(data.actorPubkey)) {
  return Response.json({ error: 'Invalid actorPubkey format' }, { status: 400 })
}
```

### M16: Enforce maxBlastsPerDay
```typescript
const settings = await this.ctx.storage.get<BlastSettings>('settings') || { maxBlastsPerDay: 10 }
const today = new Date().toISOString().slice(0, 10)
const sentToday = blasts.filter(b => b.status === 'sent' && b.sentAt?.startsWith(today)).length
if (sentToday >= (settings.maxBlastsPerDay || 10)) {
  return Response.json({ error: 'Daily blast limit reached' }, { status: 429 })
}
```

### M17: Constant-Time Preference Token Lookup
```typescript
// Direct storage lookup instead of scanning all subscribers
const subscriberId = await this.ctx.storage.get<string>(`preferenceToken:${data.token}`)
```
When creating subscribers, also write index: `preferenceToken:${token}` → subscriberId.

### M19: Cap Upload Size
```typescript
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024 // 100 MB
const MAX_CHUNK_SIZE = 10 * 1024 * 1024   // 10 MB

if (body.totalSize > MAX_UPLOAD_SIZE) {
  return c.json({ error: 'File too large' }, 400)
}
// Per-chunk check:
if (chunk.byteLength > MAX_CHUNK_SIZE) {
  return c.json({ error: 'Chunk too large' }, 400)
}
```

### M33: Invert Dev Reset Default
```typescript
function checkResetSecret(c: Context): boolean {
  const secret = c.env.DEV_RESET_SECRET || c.env.E2E_TEST_SECRET
  if (!secret) return false  // deny by default
  return c.req.header('X-Test-Secret') === secret
}
```

## Tests

### Worker Integration Tests
- Provisioning returns 429 after 30 requests/minute
- Debug endpoint returns 403 for non-admin
- Setup state returns 403 for volunteers
- Hub settings rejects unknown keys
- CORS rejects unknown origins
- Audit rejects malformed actorPubkey
- Blast send returns 429 at daily limit
- Upload init rejects totalSize > 100MB
- Upload chunk rejects oversized chunks
- Dev reset denied without secret

### Desktop E2E Updates
- Update tests relying on debug endpoint
- Verify provisioning flow with rate limiting

## Files to Modify
| File | Action |
|------|--------|
| `apps/worker/lib/crypto.ts` | Contact migration helper |
| `apps/worker/routes/provisioning.ts` | Rate limiting |
| `apps/worker/durable-objects/call-router.ts` | Gate debug route |
| `apps/worker/routes/setup.ts` | Permission guard |
| `apps/worker/durable-objects/settings-do.ts` | Validate hub settings |
| `apps/worker/middleware/cors.ts` | Explicit origin allowlist |
| `apps/worker/durable-objects/records-do.ts` | Validate actorPubkey |
| `apps/worker/durable-objects/blast-do.ts` | maxBlastsPerDay, index tokens |
| `apps/worker/routes/uploads.ts` | Size limits |
| `apps/worker/routes/dev.ts` | Invert reset default |

## Dependencies
- CORS allowlist must include all legitimate client origins
- Preference token indexing needs data migration for existing subscribers
