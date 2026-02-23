import { test, expect } from '@playwright/test'
import { loginAsAdmin, uniquePhone, resetTestState } from './helpers'

test.describe('Invite-based onboarding', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  let inviteLink: string

  test('admin creates invite and volunteer completes onboarding', async ({ page }) => {
    // --- Step 1: Admin creates invite ---
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()

    const volName = `Onboard ${Date.now()}`
    const volPhone = uniquePhone()

    await page.getByRole('button', { name: /invite/i }).click()
    await page.getByLabel('Name').fill(volName)
    await page.getByLabel('Phone Number').fill(volPhone)
    await page.getByLabel('Phone Number').blur()
    await page.getByRole('button', { name: /create invite/i }).click()

    // Invite link should appear
    const linkEl = page.locator('code').first()
    await expect(linkEl).toBeVisible({ timeout: 15000 })
    inviteLink = (await linkEl.textContent())!
    expect(inviteLink).toContain('/onboarding?code=')

    // --- Step 2: Log out admin ---
    await page.getByRole('button', { name: /log out/i }).click()
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

    // --- Step 3: Volunteer opens invite link ---
    await page.goto(inviteLink)
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(volName)).toBeVisible()

    // A11y: language selector should be a radiogroup with roving tabindex
    const langGroup = page.locator('[role="radiogroup"]')
    await expect(langGroup).toBeVisible()
    await expect(langGroup.locator('[role="radio"][aria-checked="true"]')).toBeVisible()

    // --- Step 4: Click Get Started ---
    await page.getByRole('button', { name: /get started/i }).click()

    // --- Step 5: Create PIN (6 digits via PIN input) ---
    await expect(page.getByText(/create a pin/i)).toBeVisible({ timeout: 5000 })
    for (let i = 0; i < 6; i++) {
      const input = page.locator(`input[aria-label="PIN digit ${i + 1}"]`)
      await input.click()
      await input.pressSequentially(`${(i + 1) % 10}`)
    }

    // --- Step 6: Confirm PIN ---
    await expect(page.getByText(/confirm your pin/i)).toBeVisible({ timeout: 5000 })
    for (let i = 0; i < 6; i++) {
      const input = page.locator(`input[aria-label="PIN digit ${i + 1}"]`)
      await input.click()
      await input.pressSequentially(`${(i + 1) % 10}`)
    }

    // --- Step 7: Recovery key page (nsec is NOT shown) ---
    await expect(page.getByText(/save your recovery key/i)).toBeVisible({ timeout: 15000 })
    const recoveryKeyEl = page.getByTestId('recovery-key')
    await expect(recoveryKeyEl).toBeVisible()
    const recoveryKey = await recoveryKeyEl.textContent()
    expect(recoveryKey).toMatch(/^[A-Z2-7]{4}-/)

    // Download backup (mandatory before continue)
    await page.getByRole('button', { name: /download encrypted backup/i }).click()

    // --- Step 8: Acknowledge backup saved ---
    await page.getByText('I have saved my recovery key').click()

    // --- Step 9: Continue to profile setup ---
    await page.getByRole('button', { name: /continue/i }).click()

    // Should land on profile-setup or dashboard
    await page.waitForURL(url => {
      const path = new URL(url.toString()).pathname
      return path === '/profile-setup' || path === '/'
    }, { timeout: 15000 })
  })

  test('invalid invite code shows error', async ({ page }) => {
    await page.goto('/onboarding?code=invalidcode123')
    await expect(page.getByText(/invalid invite/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /go to login/i })).toBeVisible()
  })

  test('missing invite code shows error', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page.getByText(/no invite code/i)).toBeVisible({ timeout: 10000 })
  })

  test('admin can see pending invites and revoke them', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()

    // Create an invite
    const volName = `Revoke ${Date.now()}`
    const volPhone = uniquePhone()

    await page.getByRole('button', { name: /invite/i }).click()
    await page.getByLabel('Name').fill(volName)
    await page.getByLabel('Phone Number').fill(volPhone)
    await page.getByLabel('Phone Number').blur()
    await page.getByRole('button', { name: /create invite/i }).click()

    // Close the invite link card
    await page.getByRole('button', { name: /close/i }).click()

    // Pending invites section should show our invite
    await expect(page.getByText(volName)).toBeVisible()

    // Revoke it — find the paragraph with the volunteer name, then go up to the parent container
    const inviteEntry = page.locator('p').filter({ hasText: volName }).locator('..').locator('..')
    await inviteEntry.getByRole('button', { name: /revoke/i }).click()

    // Invite should be removed
    await expect(page.locator('main').getByText(volName)).not.toBeVisible({ timeout: 5000 })
  })
})
