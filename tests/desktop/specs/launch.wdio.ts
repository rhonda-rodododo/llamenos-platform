/**
 * Launch tests — verify the Tauri app opens and renders correctly.
 * Epic 88: Desktop & Mobile E2E Tests.
 */

describe('App Launch', () => {
  it('should open the main window', async () => {
    // The app should launch and have a window
    const title = await browser.getTitle()
    expect(title).toBe('Hotline')
  })

  it('should render the login page for unauthenticated users', async () => {
    // Wait for the SPA to hydrate
    const heading = await $('h1')
    await heading.waitForExist({ timeout: 15_000 })

    const text = await heading.getText()
    expect(text.toLowerCase()).toContain('sign in')
  })

  it('should have the correct window dimensions', async () => {
    const { width, height } = await browser.getWindowRect()
    // Default window: 1200x800, but allow for OS chrome
    expect(width).toBeGreaterThanOrEqual(800)
    expect(height).toBeGreaterThanOrEqual(600)
  })

  it('should have no console errors on startup', async () => {
    const logs = await browser.getLogs('browser')
    const errors = logs.filter((log: { level: string }) => log.level === 'SEVERE')
    expect(errors).toHaveLength(0)
  })
})
