import { type Page, expect } from '@playwright/test'
import { TestIds } from '../test-ids'
import { Timeouts } from '../helpers'

export const LoginPage = {
  async goto(page: Page): Promise<void> {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
  },

  async enterNsec(page: Page, nsec: string): Promise<void> {
    await page.getByTestId(TestIds.NSEC_INPUT).fill(nsec)
  },

  async submit(page: Page): Promise<void> {
    await page.getByTestId(TestIds.LOGIN_SUBMIT_BTN).click()
  },

  async assertNsecIsPasswordField(page: Page): Promise<void> {
    await expect(page.getByTestId(TestIds.NSEC_INPUT)).toHaveAttribute('type', 'password')
  },

  async assertErrorVisible(page: Page): Promise<void> {
    await expect(page.getByTestId(TestIds.ERROR_MESSAGE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async assertPinInputVisible(page: Page): Promise<void> {
    await expect(page.getByTestId(TestIds.PIN_INPUT).first()).toBeVisible({ timeout: Timeouts.AUTH })
  },
}
