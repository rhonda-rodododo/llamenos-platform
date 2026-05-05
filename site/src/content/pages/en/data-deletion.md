---
title: Data Deletion
subtitle: How to request deletion of your Llámenos data and what happens when you do.
---

**Last updated: May 4, 2026**

Llámenos is developed by an EU-based organization. Under GDPR Article 17, you have the right to request erasure of your personal data. This page explains how to make that request and what data is deleted or retained.

---

## How to Request Data Deletion

You can request deletion of your account and all associated data through any of the following methods:

### 1. In-app (self-service)

Go to **Settings → Account → Delete Account** within the Llámenos app. This immediately removes your account and all associated data from your hub.

### 2. Via your hub administrator

Hub administrators can delete volunteer accounts and all associated data from the admin panel. Contact the administrator of the hub you belong to and ask them to delete your account.

### 3. By email

Send a request to [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com) with the following information:

- Your display name in the app
- The name of the hub you belong to (e.g., the organization running the hotline)

Requests are processed within **30 days** per GDPR Article 17.

---

## What Gets Deleted

When your account is deleted, the following data is permanently removed:

| Data | Deleted? |
|------|----------|
| Account credentials and device keys | Yes — immediately |
| Display name and role | Yes — immediately |
| All encrypted notes and reports you authored | Yes — ciphertext deleted from server |
| Case records and contact records you created | Yes — ciphertext deleted from server |
| Push notification token (FCM) | Yes — immediately |
| Shift records and availability data | Yes — immediately |
| Crash reports associated with your account | Yes — within 30 days |

---

## What Is Retained (and Why)

Some data is retained after deletion for legal and integrity reasons:

### Audit log entries — anonymized, retained indefinitely

Llámenos uses a tamper-evident hash-chained audit log to detect unauthorized modifications to activity records. Deleting individual entries would break the chain and undermine the integrity guarantee.

**What happens instead:** All personal identifiers in audit log entries referencing you (your display name, account ID) are replaced with an anonymized hash. The event itself (e.g., "call answered at 14:32") is retained, but it cannot be linked back to you after anonymization.

**Retention period:** Lifetime of the hub. The hub administrator controls when the hub's audit log is purged.

### References in other users' content — anonymized

If another user's encrypted notes reference you as a call participant, that reference is anonymized (replaced with a placeholder). The other user's content is not deleted — it belongs to them.

---

## Retention Periods Summary

| Data type | Retention after deletion request |
|-----------|----------------------------------|
| Account, keys, tokens | Deleted immediately |
| Encrypted notes, reports, messages | Deleted within 30 days |
| Crash reports | Deleted within 30 days |
| Backup copies | Purged from backup rotation within 90 days |
| Audit log entries | Anonymized immediately; hash chain retained indefinitely |

---

## Data Portability

Before requesting deletion, you can export a copy of your data. Contact your hub administrator to request an export. They can provide your notes, reports, and account information in a structured format.

---

## Questions

For privacy-related questions, contact us at [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

For more information about what data Llámenos collects and how it is protected, see our [Privacy Policy](/privacy).
