# Epic 107: Multi-Platform Security Hardening

**Status: PENDING** (depends on Epic 101)
**Repos**: All three

## Summary

Harden all three platforms against common mobile/desktop attack vectors.

## Tasks

### Certificate Pinning
- Mobile: Pin API server TLS cert via custom fetch wrapper
- Desktop: Custom reqwest client with cert pinning for updater endpoint

### Secure Key Storage Audit
- Mobile: Verify expo-secure-store uses Keychain (iOS) and EncryptedSharedPreferences (Android)
- Desktop: Verify Tauri Stronghold PBKDF2 600K iterations, zeroize on all paths

### Runtime Integrity
- Mobile: Detect jailbreak/root (warning, not blocking)
- Desktop: Isolation script hash verification

### Network Layer
- Enforce minimum TLS 1.2 on all platforms
- Reject self-signed certificates in production
- HSTS header validation
