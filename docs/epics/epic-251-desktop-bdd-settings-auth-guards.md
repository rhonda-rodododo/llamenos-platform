# Epic 251: Desktop BDD Behavioral Recovery — Settings, Auth Guards & Desktop-Specific Flows

## Goal

Recover behavioral depth for settings persistence, authentication guards, language switching, theme persistence, and desktop-specific admin flows. The original `admin-flow.spec.ts` tested language switching (English→Español→English with heading verification), settings toggles, and logout. Auth guard testing was distributed across `volunteer-flow.spec.ts` (100 lines) which tested volunteer navigation restrictions and admin page access denial.

## What Was Lost

### Volunteer Flow (original volunteer-flow.spec.ts — 100 lines)
- Volunteer login → profile setup
- **Navigation restrictions**: Volunteer sees Dashboard/Notes/Settings but NOT Volunteers/Shifts/Ban List
- **Break toggle**: Tap break button → status changes
- **Admin page denial**: SPA navigate to /volunteers, /shifts, /bans → all show "Access Denied"
- Settings shows transcription toggle but NOT spam settings

### Admin Settings (from admin-flow.spec.ts)
- Admin settings page loads with all sections (Transcription, Spam Mitigation, Voice CAPTCHA, Rate Limiting)
- **Settings toggles work**: Actually clicking toggles and verifying state change
- **Status summaries visible when collapsed**: Telephony provider card, transcription card show summary text
- **Language switching**: Switch to Español → heading changes to "Panel", nav shows "Notas" → switch back → "Dashboard"

### Desktop-Specific Auth (from desktop feature files)
- Auth guards redirect unauthenticated users
- PIN re-entry required after page reload
- Logout clears state
- PIN challenge for sensitive actions (phone unmask)
- Login restore: fresh install vs stored key

## Current State (Hollow Step Definitions)

### settings-steps.ts likely problems:
- Toggle steps don't verify state persists after page reload
- Language switching probably just clicks button without verifying translated text

### auth-guards-steps.ts likely problems:
- Redirect verification probably uses `.or()` or guard patterns
- PIN re-entry after reload probably has timing issues

### Key problem across all desktop-specific steps:
- No verification that settings changes persist to backend/storage
- No verification that auth restrictions actually prevent access (vs just hiding UI)
- No verification that logout actually clears all state

## Implementation

### Phase 1: Settings Persistence Testing

Expand settings step definitions to verify persistence:

```typescript
// Settings toggle persists after reload
When('I toggle the auto-lock setting', async ({ page }) => {
  const toggle = page.getByTestId(TestIds.SETTINGS_AUTO_LOCK)
  const wasBefore = await toggle.isChecked()
  await toggle.click()
  const isAfter = await toggle.isChecked()
  expect(isAfter).not.toBe(wasBefore)

  // Store for later verification
  await page.evaluate((v) => {
    (window as any).__test_auto_lock = v
  }, isAfter)
})

Then('the auto-lock setting should persist after reload', async ({ page }) => {
  const expected = await page.evaluate(() => (window as any).__test_auto_lock)
  await page.reload()
  await reenterPinAfterReload(page)
  await navigateAfterLogin(page, '/settings')

  const toggle = page.getByTestId(TestIds.SETTINGS_AUTO_LOCK)
  expect(await toggle.isChecked()).toBe(expected)
})
```

### Phase 2: Theme Persistence

Rewrite `tests/steps/settings/theme-steps.ts`:

```typescript
When('I select the dark theme', async ({ page }) => {
  await page.getByTestId(TestIds.THEME_DARK).click()
})

Then('the page should use the dark theme', async ({ page }) => {
  // Verify the dark class is on the html element
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(isDark).toBe(true)
})

Then('the dark theme should persist after reload', async ({ page }) => {
  await page.reload()
  await reenterPinAfterReload(page)
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(isDark).toBe(true)
})
```

### Phase 3: Language Switching

Rewrite language steps to verify actual text changes:

```typescript
When('I switch the language to Espanol', async ({ page }) => {
  await navigateAfterLogin(page, '/settings')
  // Click Spanish language chip
  const espanol = page.getByText('Español')
  await espanol.click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see the "Panel" heading', async ({ page }) => {
  // "Panel" is the Spanish translation of "Dashboard"
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText('Panel')
})

Then('I should see "Notas" in the navigation', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_NOTES)).toContainText('Notas')
})

When('I switch the language back to English', async ({ page }) => {
  await navigateAfterLogin(page, '/settings')
  const english = page.getByText('English')
  await english.click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})
```

### Phase 4: Auth Guard Enforcement

Rewrite `tests/steps/auth/auth-guards-steps.ts`:

```typescript
// Verify volunteer cannot access admin pages
When('a volunteer navigates to {string}', async ({ page }, path: string) => {
  await navigateAfterLogin(page, path)
})

Then('they should see {string}', async ({ page }, text: string) => {
  // Hard assert — no .or() fallback
  await expect(page.getByText(text, { exact: false })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// Verify unauthenticated redirect
Given('I am not authenticated', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

When('I navigate directly to {string}', async ({ page }, path: string) => {
  await page.goto(path)
})

Then('I should be redirected to the login page', async ({ page }) => {
  await page.waitForURL(/\/login/, { timeout: Timeouts.NAVIGATION })
})
```

### Phase 5: Desktop Admin Flow

Rewrite `tests/steps/desktop/admin-flow-steps.ts` for the `admin-flow.feature`:

**Key changes:**
- Volunteer CRUD: create → verify nsec shown → dismiss → verify in list → delete → verify gone → verify via API
- Shift CRUD: create → verify in list → edit → verify new name → delete → verify gone
- Ban CRUD: add → verify phone + reason → remove → verify gone
- Settings: navigate to hub settings → verify all sections visible → expand sections → verify toggle interaction
- Call history: navigate → verify heading → search → verify clear button → clear → verify reset
- Language: switch to Español → verify headings/nav translated → switch back → verify English

### Phase 6: Expand Feature Files Where Needed

**Add new scenarios to settings/theme.feature:**
```gherkin
  Scenario: Theme persists after page reload
    When I select the dark theme
    And I reload the page
    Then the dark theme should still be active
```

**Add new scenarios to settings/language-selection.feature:**
```gherkin
  Scenario: Language persists after page reload
    When I select Español as my language
    And I reload the page
    Then the UI should still be in Español
```

**Add new scenarios to desktop/auth/auth-guards.feature:**
```gherkin
  Scenario: Volunteer cannot access admin pages via URL
    Given a volunteer is logged in
    When a volunteer navigates to "/volunteers"
    Then they should see "Access Denied"
    When a volunteer navigates to "/shifts"
    Then they should see "Access Denied"
    When a volunteer navigates to "/bans"
    Then they should see "Access Denied"
```

## Files Changed

| File | Action |
|------|--------|
| `tests/steps/settings/settings-steps.ts` | Rewrite — persistence verification |
| `tests/steps/settings/theme-steps.ts` | Rewrite — dark class check + reload persistence |
| `tests/steps/settings/language-steps.ts` | Rewrite — actual text verification |
| `tests/steps/settings/advanced-settings-steps.ts` | Rewrite — toggle state verification |
| `tests/steps/auth/auth-guards-steps.ts` | Rewrite — hard assertions, no fallbacks |
| `tests/steps/auth/login-restore-steps.ts` | Rewrite — verify state after reload |
| `tests/steps/desktop/admin-flow-steps.ts` | New or rewrite — full admin flow behavioral steps |
| Various feature files | Add persistence and auth guard scenarios |

## Verification

1. Theme selection persists after page reload
2. Language switching shows correct translated headings and navigation
3. Settings toggle changes persist after reload
4. Volunteer cannot access admin pages (access denied, not just hidden nav)
5. Unauthenticated users redirected to login
6. PIN re-entry works after reload
7. Logout clears all auth state
8. Admin flow CRUD operations verified end-to-end
9. Zero `.or()` fallbacks in rewritten steps
10. `bun run test` passes
