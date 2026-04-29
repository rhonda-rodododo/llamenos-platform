---
title: "Shifts and Scheduling"
description: "Creating shifts, assigning team members, and configuring fallback behavior."
audience: [admin]
task: [configuration, daily-use]
feature: "shifts"
order: 5
---

This guide covers Desktop, iOS, and Android. Where the experience differs, platform-specific instructions are noted.

Shifts determine who receives calls and when. The system uses your shift schedule to decide which users to ring when a call comes in.

## Creating a shift

Go to the **Shifts** section and add a new shift. For each shift, you will set:

- **Name** — a label like "Morning Shift" or "Weekend Coverage"
- **Days of the week** — which days this shift repeats on
- **Start and end times** — when the shift begins and ends each day
- **Assigned users** — which team members are on this shift

### Creating a shift by platform

**On Desktop:** Click **Add Shift** on the Shifts page. Use the searchable dropdown to add multiple users to a single shift.

**On iOS:** Tap the **+** button on the Shifts screen. Tap each field to configure the shift details. Use the user picker to assign team members.

**On Android:** Tap the floating action button on the Shifts screen. Fill in shift details in the form and use the user selector to assign members.

## How shift routing works

When a call comes in, the system checks which shift is currently active. All users assigned to that shift are rung simultaneously — this is called parallel ringing. The first person to answer gets the call.

If a user has turned on **break mode**, they will not be rung even if they are assigned to the active shift.

## Recurring schedules

Shifts repeat automatically on the days you select. You do not need to recreate them each week. If you need to make a one-time change, edit the shift temporarily and change it back later.

## Fallback group

In the Shifts section, you can configure a **Fallback Group**. These are users who will be rung when:

- No shift is currently active
- The active shift has no available users (everyone is on break or offline)

The fallback group is your safety net — it ensures someone is always reachable.

## Tips for scheduling

- Overlapping shifts are fine — users on both shifts will all ring
- Assign at least two people per shift so calls are covered if someone steps away
- Review your fallback group regularly to make sure it includes active users
