import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getConfig, setActiveHub } from './api'
import type { EnabledChannels, Hub } from '@shared/types'

interface ConfigContextValue {
  hotlineName: string
  hotlineNumber: string
  channels: EnabledChannels
  setupCompleted: boolean
  demoMode: boolean
  needsBootstrap: boolean
  isLoading: boolean
  hubs: Hub[]
  defaultHubId: string | undefined
  currentHubId: string | undefined
  setCurrentHubId: (id: string) => void
  isMultiHub: boolean
  /** Server's Nostr pubkey for verifying authoritative events */
  serverNostrPubkey: string | undefined
  /** Client-facing Nostr relay URL */
  nostrRelayUrl: string | undefined
}

const defaultChannels: EnabledChannels = {
  voice: true,
  sms: false,
  whatsapp: false,
  signal: false,
  rcs: false,
  reports: false,
}

const ConfigContext = createContext<ConfigContextValue>({
  hotlineName: 'Hotline',
  hotlineNumber: '',
  channels: defaultChannels,
  setupCompleted: true,
  demoMode: false,
  needsBootstrap: false,
  isLoading: true,
  hubs: [],
  defaultHubId: undefined,
  currentHubId: undefined,
  setCurrentHubId: () => {},
  isMultiHub: false,
  serverNostrPubkey: undefined,
  nostrRelayUrl: undefined,
})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [hotlineName, setHotlineName] = useState('Hotline')
  const [hotlineNumber, setHotlineNumber] = useState('')
  const [channels, setChannels] = useState<EnabledChannels>(defaultChannels)
  const [setupCompleted, setSetupCompleted] = useState(true)
  const [demoMode, setDemoMode] = useState(false)
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hubs, setHubs] = useState<Hub[]>([])
  const [defaultHubId, setDefaultHubId] = useState<string | undefined>()
  const [currentHubId, setCurrentHubIdState] = useState<string | undefined>()
  const [serverNostrPubkey, setServerNostrPubkey] = useState<string | undefined>()
  const [nostrRelayUrl, setNostrRelayUrl] = useState<string | undefined>()

  function setCurrentHubId(id: string) {
    setCurrentHubIdState(id)
    setActiveHub(id)
  }

  useEffect(() => {
    getConfig()
      .then(config => {
        setHotlineName(config.hotlineName)
        setHotlineNumber(config.hotlineNumber || '')
        if (config.channels) setChannels(config.channels)
        if (config.setupCompleted !== undefined) setSetupCompleted(config.setupCompleted)
        if (config.demoMode) setDemoMode(config.demoMode)
        setNeedsBootstrap(!!config.needsBootstrap)
        if (config.hubs?.length) {
          setHubs(config.hubs)
          const hubId = config.defaultHubId || config.hubs[0].id
          setDefaultHubId(hubId)
          setCurrentHubIdState(hubId)
          setActiveHub(hubId)
        }
        if (config.serverNostrPubkey) setServerNostrPubkey(config.serverNostrPubkey)
        if (config.nostrRelayUrl) setNostrRelayUrl(config.nostrRelayUrl)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  // Set document title
  useEffect(() => {
    if (!isLoading) document.title = hotlineName
  }, [hotlineName, isLoading])

  const isMultiHub = hubs.length > 1

  return (
    <ConfigContext.Provider value={{
      hotlineName, hotlineNumber, channels, setupCompleted,
      demoMode, needsBootstrap, isLoading, hubs, defaultHubId, currentHubId,
      setCurrentHubId, isMultiHub, serverNostrPubkey, nostrRelayUrl,
    }}>
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
