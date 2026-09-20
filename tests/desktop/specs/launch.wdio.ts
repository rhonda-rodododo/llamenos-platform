/**
 * Launch tests — verify the Tauri app opens and renders correctly.
 * Epic 88: Desktop & Mobile E2E Tests.
 */

describe('App Launch', () => {
  it('should open the main window', async () => {
    const title = await browser.getTitle()
    expect(title).toBe('Hotline')
  })

  it('should render the login page for unauthenticated users', async () => {
    // CardTitle renders as h3 with data-slot="card-title"
    const heading = await $('[data-slot="card-title"]')
    await heading.waitForExist({ timeout: 15_000 })

    const text = await heading.getText()
    // Login page shows either the hotline name or "Sign in" depending on state
    expect(text.length).toBeGreaterThan(0)
  })

  it('should have the correct window dimensions', async () => {
    const { width, height } = await browser.getWindowRect()
    // Default window: 1200x800, but allow for OS chrome
    expect(width).toBeGreaterThanOrEqual(800)
    expect(height).toBeGreaterThanOrEqual(600)
  })

  it('should have Tauri internals available', async () => {
    // Verify Tauri IPC bridge is loaded in the webview
    const hasTauri = await browser.execute(() => {
      return typeof window.__TAURI_INTERNALS__ !== 'undefined'
        && typeof window.__TAURI_INTERNALS__.invoke === 'function'
    })
    expect(hasTauri).toBe(true)
  })
})
