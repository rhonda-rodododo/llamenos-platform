/**
 * Desktop auto-update checker (Epic 87).
 *
 * Checks for updates on mount and every 6 hours when running in Tauri.
 * Shows a dismissible banner with version info and download progress.
 * Silent failures — never blocks the app with update errors.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
// Tauri-only app — always in Tauri context

interface UpdateInfo {
  version: string
  notes: string
  date: string | null
}

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'downloading'; progress: number; total: number }
  | { status: 'ready' }
  | { status: 'dismissed' }

const CHECK_INTERVAL = 6 * 60 * 60 * 1000 // 6 hours

export function UpdateChecker() {
  const { t } = useTranslation()
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  // Store the update object ref so we can call downloadAndInstall later
  const updateRef = useRef<Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>> | null>(null)

  const checkForUpdate = useCallback(async () => {
    // Always in Tauri context

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (update) {
        updateRef.current = update
        setState({
          status: 'available',
          info: {
            version: update.version,
            notes: update.body ?? '',
            date: update.date ?? null,
          },
        })
      }
    } catch {
      // Silent failure — don't bother the user with update check errors
    }
  }, [])

  useEffect(() => {
    // Always in Tauri context

    // Check on mount (short delay to not block startup)
    const timeout = setTimeout(checkForUpdate, 5000)

    // Check periodically
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [checkForUpdate])

  const handleDownload = useCallback(async () => {
    const update = updateRef.current
    if (!update) return

    try {
      let downloaded = 0
      let contentLength = 0

      setState({ status: 'downloading', progress: 0, total: 0 })

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0
            setState({ status: 'downloading', progress: 0, total: contentLength })
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            setState({ status: 'downloading', progress: downloaded, total: contentLength })
            break
          case 'Finished':
            setState({ status: 'ready' })
            break
        }
      })

      setState({ status: 'ready' })
    } catch {
      // Download failed — revert to available state
      setState({
        status: 'available',
        info: {
          version: update.version,
          notes: update.body ?? '',
          date: update.date ?? null,
        },
      })
    }
  }, [])

  const handleRelaunch = useCallback(async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch {
      // Relaunch failed — user can restart manually
    }
  }, [])

  const dismiss = useCallback(() => {
    setState({ status: 'dismissed' })
  }, [])

  if (state.status === 'idle' || state.status === 'dismissed') return null

  return (
    <div className="border-b border-border bg-primary/5 px-4 py-2">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-4">
        {state.status === 'available' && (
          <>
            <p className="text-sm text-foreground">
              {t('updates.available', 'Version {{version}} is available', {
                version: state.info.version,
              })}
              {state.info.notes && (
                <span className="ml-2 text-muted-foreground">— {state.info.notes.slice(0, 100)}</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              >
                {t('updates.download', 'Update')}
              </button>
              <button
                onClick={dismiss}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                aria-label={t('common.dismiss', 'Dismiss')}
              >
                {t('common.dismiss', 'Dismiss')}
              </button>
            </div>
          </>
        )}

        {state.status === 'downloading' && (
          <>
            <div className="flex flex-1 items-center gap-3">
              <p className="text-sm text-foreground">
                {t('updates.downloading', 'Downloading update...')}
              </p>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: state.total > 0
                      ? `${Math.round((state.progress / state.total) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
              {state.total > 0 && (
                <span className="text-xs text-muted-foreground">
                  {Math.round((state.progress / state.total) * 100)}%
                </span>
              )}
            </div>
          </>
        )}

        {state.status === 'ready' && (
          <>
            <p className="text-sm text-foreground">
              {t('updates.ready', 'Update ready. Restart to apply.')}
            </p>
            <button
              onClick={handleRelaunch}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            >
              {t('updates.restart', 'Restart Now')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
