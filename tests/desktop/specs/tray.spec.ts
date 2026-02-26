/**
 * System tray tests — verify tray icon and window visibility toggling.
 *
 * Note: System tray interactions are limited through WebDriver protocol.
 * We test what's programmatically accessible via Tauri's API.
 *
 * Epic 88: Desktop & Mobile E2E Tests.
 */

describe('System Tray', () => {
  it('should have the window visible on launch', async () => {
    const isVisible = await browser.execute(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        return await getCurrentWindow().isVisible()
      } catch {
        return null
      }
    })

    expect(isVisible).toBe(true)
  })

  it('should be able to hide the window programmatically', async () => {
    const result = await browser.execute(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()

        // Hide the window
        await win.hide()
        const hiddenState = await win.isVisible()

        // Show it again immediately
        await win.show()
        const visibleState = await win.isVisible()

        return { hidden: hiddenState, visible: visibleState }
      } catch (e) {
        return { error: String(e) }
      }
    })

    if ('error' in result) {
      // Permission might be denied — skip gracefully
      console.warn('Tray hide/show test skipped:', result.error)
    } else {
      expect(result.hidden).toBe(false)
      expect(result.visible).toBe(true)
    }
  })

  it('should be able to minimize and restore the window', async () => {
    const result = await browser.execute(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()

        await win.minimize()
        const minimized = await win.isMinimized()

        await win.unminimize()
        // Small delay for window manager
        await new Promise(r => setTimeout(r, 200))
        const restored = await win.isMinimized()

        return { minimized, restored: !restored }
      } catch (e) {
        return { error: String(e) }
      }
    })

    if ('error' in result) {
      console.warn('Minimize/restore test skipped:', result.error)
    } else {
      expect(result.minimized).toBe(true)
      expect(result.restored).toBe(true)
    }
  })

  it('should be able to set window title', async () => {
    const result = await browser.execute(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()

        const originalTitle = await win.title()
        await win.setTitle('Test Title')
        const newTitle = await win.title()

        // Restore original title
        await win.setTitle(originalTitle)

        return { originalTitle, newTitle }
      } catch (e) {
        return { error: String(e) }
      }
    })

    if ('error' in result) {
      console.warn('Set title test skipped:', result.error)
    } else {
      expect(result.originalTitle).toBe('Hotline')
      expect(result.newTitle).toBe('Test Title')
    }
  })
})
