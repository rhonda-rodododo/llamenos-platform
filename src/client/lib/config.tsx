import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getConfig } from './api'
import type { EnabledChannels } from '@shared/types'

interface ConfigContextValue {
  hotlineName: string
  hotlineNumber: string
  channels: EnabledChannels
  setupCompleted: boolean
  adminPubkey: string
  demoMode: boolean
  needsBootstrap: boolean
  isLoading: boolean
}

const defaultChannels: EnabledChannels = {
  voice: true,
  sms: false,
  whatsapp: false,
  signal: false,
  reports: false,
}

const ConfigContext = createContext<ConfigContextValue>({
  hotlineName: 'Hotline',
  hotlineNumber: '',
  channels: defaultChannels,
  setupCompleted: true,
  adminPubkey: '',
  demoMode: false,
  needsBootstrap: false,
  isLoading: true,
})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [hotlineName, setHotlineName] = useState('Hotline')
  const [hotlineNumber, setHotlineNumber] = useState('')
  const [channels, setChannels] = useState<EnabledChannels>(defaultChannels)
  const [setupCompleted, setSetupCompleted] = useState(true)
  const [adminPubkey, setAdminPubkey] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getConfig()
      .then(config => {
        setHotlineName(config.hotlineName)
        setHotlineNumber(config.hotlineNumber || '')
        if (config.channels) setChannels(config.channels)
        if (config.setupCompleted !== undefined) setSetupCompleted(config.setupCompleted)
        if (config.adminPubkey) setAdminPubkey(config.adminPubkey)
        if (config.demoMode) setDemoMode(config.demoMode)
        setNeedsBootstrap(!!config.needsBootstrap)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  // Set document title
  useEffect(() => {
    if (!isLoading) document.title = hotlineName
  }, [hotlineName, isLoading])

  return (
    <ConfigContext.Provider value={{ hotlineName, hotlineNumber, channels, setupCompleted, adminPubkey, demoMode, needsBootstrap, isLoading }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  return useContext(ConfigContext)
}

/** Whether any messaging channel is enabled (SMS, WhatsApp, Signal, or web reports) */
export function useHasMessaging() {
  const { channels } = useConfig()
  return channels.sms || channels.whatsapp || channels.signal || channels.reports
}
