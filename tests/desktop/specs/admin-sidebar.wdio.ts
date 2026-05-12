/**
 * Admin sidebar navigation tests.
 *
 * Verifies the admin shell layout, sidebar groups, section navigation,
 * heading display, and legacy route redirects inside the Tauri WebView.
 */

describe('Admin Sidebar', () => {
  async function navigateTo(path: string): Promise<void> {
    await browser.execute(`window.location.hash = ''; window.history.pushState({}, '', '${path}')`)
    await browser.execute('window.dispatchEvent(new PopStateEvent("popstate"))')
    await browser.pause(500)
  }

  // --- Shell Layout ---

  it('should render admin shell at /admin/location-lookup', async () => {
    await navigateTo('/admin/location-lookup')
    const shell = await $('[data-testid="admin-shell"]')
    await shell.waitForExist({ timeout: 10_000 })
    expect(await shell.isDisplayed()).toBe(true)
  })

  it('should show sidebar on desktop viewport', async () => {
    await navigateTo('/admin/location-lookup')
    const sidebar = await $('[data-testid="admin-sidebar"]')
    await sidebar.waitForExist({ timeout: 10_000 })
    expect(await sidebar.isDisplayed()).toBe(true)
  })

  it('should display section heading matching the current section', async () => {
    await navigateTo('/admin/call-settings')
    const heading = await $('[data-testid="admin-section-heading"]')
    await heading.waitForExist({ timeout: 10_000 })
    const text = await heading.getText()
    expect(text.length).toBeGreaterThan(0)
  })

  it('should render section content area with data-section attribute', async () => {
    await navigateTo('/admin/spam-protection')
    const section = await $('[data-testid="admin-section"]')
    await section.waitForExist({ timeout: 10_000 })
    expect(await section.getAttribute('data-section')).toBe('spam-protection')
  })

  // --- Sidebar Groups ---

  it('should render this-hub scope section', async () => {
    await navigateTo('/admin/location-lookup')
    const scope = await $('[data-testid="admin-sidebar-scope-this-hub"]')
    await scope.waitForExist({ timeout: 10_000 })
    expect(await scope.isDisplayed()).toBe(true)
  })

  it('should render sidebar groups with headers', async () => {
    await navigateTo('/admin/location-lookup')
    const groups = ['general', 'people', 'intake', 'calls-voice', 'channels', 'operations']
    for (const group of groups) {
      const el = await $(`[data-testid="admin-sidebar-group-${group}"]`)
      await el.waitForExist({ timeout: 10_000 })
      expect(await el.isDisplayed()).toBe(true)
    }
  })

  // --- Navigation ---

  it('should highlight active nav item', async () => {
    await navigateTo('/admin/passkey-policy')
    const item = await $('[data-testid="admin-sidebar-item-passkey-policy"]')
    await item.waitForExist({ timeout: 10_000 })
    const className = await item.getAttribute('class')
    expect(className).toContain('bg-sidebar-accent')
  })

  it('should navigate between sections via sidebar links', async () => {
    await navigateTo('/admin/location-lookup')
    const link = await $('[data-testid="admin-sidebar-item-custom-fields"]')
    await link.waitForExist({ timeout: 10_000 })
    await link.click()
    await browser.pause(500)

    const section = await $('[data-testid="admin-section"]')
    await section.waitForExist({ timeout: 10_000 })
    expect(await section.getAttribute('data-section')).toBe('custom-fields')
  })

  it('should update heading when navigating to a different section', async () => {
    await navigateTo('/admin/location-lookup')
    const heading = await $('[data-testid="admin-section-heading"]')
    await heading.waitForExist({ timeout: 10_000 })
    const firstText = await heading.getText()

    await navigateTo('/admin/transcription')
    await browser.pause(500)
    const secondText = await heading.getText()

    expect(firstText).not.toBe(secondText)
  })

  // --- Index Redirect ---

  it('should redirect /admin to first accessible section', async () => {
    await navigateTo('/admin')
    await browser.pause(1000)
    const url = await browser.getUrl()
    expect(url).toMatch(/\/admin\//)
    // First accessible section should be location-lookup
    expect(url).toContain('location-lookup')
  })

  // --- Legacy Redirects ---

  it('should redirect /admin/hubs legacy route', async () => {
    await navigateTo('/admin/hubs')
    await browser.pause(500)
    const section = await $('[data-testid="admin-section"]')
    await section.waitForExist({ timeout: 10_000 })
  })

  it('should redirect /admin/firehose legacy route', async () => {
    await navigateTo('/admin/firehose')
    await browser.pause(500)
    const section = await $('[data-testid="admin-section"]')
    await section.waitForExist({ timeout: 10_000 })
  })

  // --- Section Content ---

  it('should render real content for wired sections', async () => {
    const wiredSections = ['location-lookup', 'bans', 'audit', 'custom-fields']
    for (const slug of wiredSections) {
      await navigateTo(`/admin/${slug}`)
      const section = await $('[data-testid="admin-section"]')
      await section.waitForExist({ timeout: 10_000 })
      expect(await section.getAttribute('data-section')).toBe(slug)
      // Real sections should not show "Coming soon"
      const html = await section.getHTML()
      expect(html).not.toContain('comingSoon')
    }
  })

  // --- Multiple Nav Items Visible ---

  it('should render all nav items in the general group', async () => {
    await navigateTo('/admin/location-lookup')
    const items = [
      'admin-sidebar-item-location-lookup',
      'admin-sidebar-item-passkey-policy',
      'admin-sidebar-item-recovery-group',
      'admin-sidebar-item-devices',
    ]
    for (const testid of items) {
      const el = await $(`[data-testid="${testid}"]`)
      await el.waitForExist({ timeout: 10_000 })
      expect(await el.isDisplayed()).toBe(true)
    }
  })
})
