/**
 * Admin sidebar navigation tests.
 */

describe('Admin Sidebar', () => {
  async function navigateTo(path: string): Promise<void> {
    await browser.execute(`window.location.hash = ''; window.history.pushState({}, '', '${path}')`)
    await browser.execute('window.dispatchEvent(new PopStateEvent("popstate"))')
    await browser.pause(500)
  }

  it('should render admin shell at /admin/location-lookup', async () => {
    await navigateTo('/admin/location-lookup')
    const shell = await $('[data-testid="admin-shell"]')
    await shell.waitForExist({ timeout: 10_000 })
    expect(await shell.isDisplayed()).toBe(true)
  })

  it('should show sidebar on desktop', async () => {
    await navigateTo('/admin/location-lookup')
    const sidebar = await $('[data-testid="admin-sidebar"]')
    await sidebar.waitForExist({ timeout: 10_000 })
    expect(await sidebar.isDisplayed()).toBe(true)
  })

  it('should highlight active nav item', async () => {
    await navigateTo('/admin/passkey-policy')
    const item = await $('[data-testid="admin-sidebar-item-passkey-policy"]')
    await item.waitForExist({ timeout: 10_000 })
    const className = await item.getAttribute('class')
    expect(className).toContain('bg-sidebar-accent')
  })

  it('should redirect /admin to first accessible section', async () => {
    await navigateTo('/admin')
    await browser.pause(1000)
    const url = await browser.getUrl()
    expect(url).toMatch(/\/admin\//)
  })
})
