---
title: "Users, Roles, and Permissions"
description: "Managing users, assigning roles, controlling what people can see and do, and working with multiple hubs."
audience: [admin]
task: [configuration, security]
feature: "permissions"
order: 6
---

This guide covers Desktop, iOS, and Android. Where the experience differs, platform-specific instructions are noted.

Roles and permissions let you control who can see and do what in your hotline. This is especially important if your organization has different groups with different responsibilities.

## Default roles

The system comes with three built-in roles:

- **Admin** — full access to everything: settings, users, shifts, bans, audit log, and all data
- **User (volunteer)** — can answer calls, write notes, view conversations, and submit reports
- **Reporter** — can only submit and view their own reports, plus the help page

## Custom roles

If the default roles do not fit your needs, create custom roles with specific permissions. This lets you give someone more access than a basic user without making them a full admin. Permissions are colon-separated strings (`calls:answer`, `notes:read-own`, etc.) and you can grant any combination.

## How permissions work

Permissions control visibility and actions:

- **What people can see** — a user sees only their own notes, while an admin sees all notes and the audit log
- **What people can do** — only admins can change settings, manage bans, or invite new members
- **Data boundaries** — reporters cannot see call records, user information, or admin settings

## Inviting new users

**On Desktop:** From the **Users** page, click **Create Invite Link**. Choose the role for the new user and share the link — it can only be used once.

**On iOS:** Go to the Users section (admin tab) and tap **Invite User**. Select a role and share the generated link.

**On Android:** Open Users from the admin navigation and tap the invite button. Select a role and share the link.

The person who opens the link will create their own credentials and be added to your hub.

## Removing access

To remove someone, find their profile in the **Users** section and deactivate their access. This takes effect immediately — their sessions are invalidated and their device authorization is revoked.

## Multiple hubs

Users can be members of multiple hubs simultaneously. Each hub maintains its own user list, roles, and data. A user's role in one hub does not affect their role in another.

Incoming calls and notifications arrive from all hubs the user belongs to, regardless of which hub is currently displayed. Admins of a hub can only manage users within that hub.

## Audit log

Every significant action — user invited, user deactivated, settings changed, call answered — is recorded in the **Audit Log**. The log is hash-chained to detect tampering. Only admins can view it.
