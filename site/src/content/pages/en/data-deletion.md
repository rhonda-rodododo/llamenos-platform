---
title: Data Deletion & Retention
subtitle: How to delete your data, what gets removed, and what is retained for audit integrity.
---

**Effective date: May 1, 2026**

Llámenos is an EU-based project and complies with GDPR Article 17 (right to erasure). This page explains how to request deletion of your account and data, what is removed, and what is retained for audit chain integrity.

---

## How to Request Deletion

### 1. In-app (hub administrators)

Hub administrators can delete user accounts directly from the admin panel. This immediately queues the account and all associated data for purge.

### 2. By email

Send a deletion request to [privacy@llamenos-hotline.com](mailto:privacy@llamenos-hotline.com) with:

- Your display name
- The name of your hub

Requests are processed within 30 days per GDPR Article 17.

### 3. GDPR Article 17 — Right to Erasure

As an EU-organized project, all users in the European Economic Area have the right to request erasure of their personal data. Contact your hub administrator (the data controller for your hub) or reach us at [privacy@llamenos-hotline.com](mailto:privacy@llamenos-hotline.com).

---

## What Gets Deleted

When an account is deleted, the following data is permanently purged from the server:

- **User account and profile** — display name, role assignments, hub memberships
- **Encrypted notes, reports, and case records** — all ciphertext is removed from the server (the server was never able to read this content, but the encrypted blobs are deleted)
- **Device push tokens** — push notification tokens associated with your devices
- **Shift schedule assignments** — your scheduled and historical shift records

---

## What Is Retained (Anonymized)

### Audit log entries

The audit log is a tamper-evident, hash-chained record of events in the system (e.g., "call answered", "note created"). It is required for integrity verification and cannot be deleted without breaking the chain.

When your account is deleted:

- All **personal identifiers** (display name, device key reference) are removed from audit log entries that reference you
- Your user reference is replaced with a **one-way hash** — the event record is preserved but cannot be linked back to you
- The hash chain structure is maintained for tamper detection

This is consistent with GDPR Recital 65, which permits retention of data necessary for legal obligations when personal identifiers are removed.

---

## Retention Periods

| Data type | Retention |
|-----------|-----------|
| Active account data | Retained while account exists |
| Notes, reports, case records (ciphertext) | Retained until deleted; purged within 30 days of deletion request |
| Device push tokens | Removed on logout, uninstall, or account deletion |
| Shift records | Purged within 30 days of account deletion |
| Audit log entries | Anonymized immediately on deletion; retained indefinitely for audit chain integrity |
| Backup snapshots | Purged within 90 days of account deletion |

---

## Data Portability

Before requesting deletion, you can export your data. Contact your hub administrator to request a data export. Hub administrators have access to export tools in the admin panel.

If you do not have access to a hub administrator, contact [privacy@llamenos-hotline.com](mailto:privacy@llamenos-hotline.com) and we will coordinate with the hub operator on your behalf.

---

## Contact

**Privacy and deletion requests:** [privacy@llamenos-hotline.com](mailto:privacy@llamenos-hotline.com)

See also: [Privacy Policy](/privacy)
