# Epic 103: Mobile App Feature Completion

**Status: IN PROGRESS**
**Repo**: llamenos-mobile

## Summary

Implement all stubbed admin features and wire up remaining API calls.

## Tasks

### 1. Admin Settings (5 sections)

Port settings from desktop to mobile. Each section with real forms:
- **Telephony Provider** — provider picker, credential fields, save to PUT /api/settings/telephony
- **Spam Settings** — CAPTCHA toggle, rate limit, ban duration, auto-block threshold
- **Call Settings** — queue timeout, voicemail toggle, max duration, recording toggle
- **Custom Fields** — CRUD for note/report field definitions (text, number, boolean, select, multiselect)
- **Roles & Permissions** — CRUD for roles with permission checkboxes grouped by domain

### 2. Volunteer Management Fixes

- Wire `handleDelete` to `DELETE /api/volunteers/{pubkey}`
- Wire `inviteMutation` to `POST /api/invites`
- Wire `addMutation` to `POST /api/volunteers` with generated keypair

### 3. API Client Additions

Add missing endpoints to `src/lib/api-client.ts` for settings, custom fields, roles, volunteer CRUD.

### 4. Type Additions

Add `TelephonySettings`, `SpamSettings`, `CallSettings`, `HubSettings`, `Role` types to `src/lib/types.ts`.
