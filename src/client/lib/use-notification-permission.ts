import { useState, useEffect, useCallback } from 'react'
import { setNotificationPrefs } from './notifications'

type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function useNotificationPermission() {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window

  const [permission, setPermission] = useState<PermissionState>(() => {
    if (!isSupported) return 'unsupported'
    return Notification.permission as 'granted' | 'denied' | 'default'
  })

  useEffect(() => {
    if (!isSupported) return

    // Try the Permissions API with onchange for live updates
    let permStatus: PermissionStatus | null = null

    navigator.permissions?.query({ name: 'notifications' }).then(status => {
      permStatus = status
      setPermission(status.state === 'prompt' ? 'default' : status.state as PermissionState)

      status.onchange = () => {
        setPermission(status.state === 'prompt' ? 'default' : status.state as PermissionState)
      }
    }).catch(() => {
      // Permissions API not available — fall back to polling
    })

    // Fallback: poll Notification.permission every 2s
    const interval = setInterval(() => {
      const current = Notification.permission as PermissionState
      setPermission(prev => prev !== current ? current : prev)
    }, 2000)

    return () => {
      clearInterval(interval)
      if (permStatus) permStatus.onchange = null
    }
  }, [isSupported])

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false

    const result = await Notification.requestPermission()
    const granted = result === 'granted'
    setPermission(result as PermissionState)

    if (granted) {
      setNotificationPrefs({ browserNotificationsEnabled: true })
    }

    return granted
  }, [isSupported])

  return { permission, requestPermission, isSupported }
}
