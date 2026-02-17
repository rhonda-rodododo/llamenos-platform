import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getConfig } from './api'
import type { EnabledChannels } from '@shared/types'

interface ConfigContextValue {
  hotlineName: string
  hotlineNumber: string
  channels: EnabledChannels
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
  isLoading: true,
})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [hotlineName, setHotlineName] = useState('Hotline')
  const [hotlineNumber, setHotlineNumber] = useState('')
  const [channels, setChannels] = useState<EnabledChannels>(defaultChannels)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getConfig()
      .then(config => {
        setHotlineName(config.hotlineName)
        setHotlineNumber(config.hotlineNumber || '')
        if (config.channels) setChannels(config.channels)
      })
      .finally(() => setIsLoading(false))
  }, [])

  // Set document title
  useEffect(() => {
    if (!isLoading) document.title = hotlineName
  }, [hotlineName, isLoading])

  return (
    <ConfigContext.Provider value={{ hotlineName, hotlineNumber, channels, isLoading }}>
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
