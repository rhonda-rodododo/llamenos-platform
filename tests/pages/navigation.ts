import { type Page, type Locator, expect } from '@playwright/test'
import { TestIds } from '../test-ids'
import { Timeouts } from '../helpers'

export const Navigation = {
  async goToDashboard(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_DASHBOARD).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToVolunteers(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_VOLUNTEERS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToShifts(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_SHIFTS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await waitForApiAndUi(page)
  },

  async goToBanList(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_BANS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToNotes(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_NOTES).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToCallHistory(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_CALLS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToAuditLog(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_AUDIT).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToSettings(page: Page): Promise<void> {
    const navSettings = page.getByTestId(TestIds.NAV_SETTINGS)
    const isVisible = await navSettings.isVisible({ timeout: 3000 }).catch(() => false)
    if (!isVisible) {
      const { loginAsAdmin } = await import('../helpers')
      await loginAsAdmin(page)
    }
    await page.getByTestId(TestIds.NAV_SETTINGS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToHubSettings(page: Page): Promise<void> {
    const navLink = page.getByTestId(TestIds.NAV_ADMIN_SETTINGS)
    const isLink = await navLink.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
    if (isLink) {
      await navLink.click()
    } else {
      await page.goto('/admin/settings')
      await page.waitForLoadState('domcontentloaded')
    }
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToReports(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_REPORTS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToConversations(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_CONVERSATIONS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToBlasts(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_BLASTS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async goToContacts(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NAV_CONTACTS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },
}

export async function waitForApiAndUi(page: Page, timeout = 2000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {})
}

export async function clickAndWaitForApi(
  page: Page,
  buttonLocator: Locator,
  apiPattern: string | RegExp,
): Promise<void> {
  await Promise.all([
    page.waitForResponse(r => {
      const url = r.url()
      return typeof apiPattern === 'string' ? url.includes(apiPattern) : apiPattern.test(url)
    }),
    buttonLocator.click(),
  ])
}
