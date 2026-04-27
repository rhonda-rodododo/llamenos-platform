import { describe, it, expect, beforeEach } from 'vitest'
import {
  getFailoverState,
  resetFailoverState,
  setActiveTarget,
  getActiveSignalConfig,
  parseFailoverConfig,
  type FailoverConfig,
} from '../../messaging/signal/failover'
import type { SignalConfig } from '@shared/types'

describe('SignalFailoverService', () => {
  const primaryConfig: SignalConfig = {
    bridgeUrl: 'http://primary:8080',
    bridgeApiKey: 'primary-key',
    webhookSecret: 'primary-secret',
    registeredNumber: '+15551111111',
    autoResponse: 'Thank you for your message',
  }

  const key = primaryConfig.registeredNumber

  beforeEach(() => {
    resetFailoverState()
  })

  describe('getFailoverState', () => {
    it('starts with primary active', () => {
      const state = getFailoverState(key)
      expect(state.activeTarget).toBe('primary')
      expect(state.consecutiveFailures).toBe(0)
    })
  })

  describe('resetFailoverState', () => {
    it('resets all state fields', () => {
      setActiveTarget(key, 'backup')
      resetFailoverState(key)
      const state = getFailoverState(key)
      expect(state.activeTarget).toBe('primary')
      expect(state.lastFailoverAt).toBeNull()
    })
  })

  describe('setActiveTarget', () => {
    it('sets target to backup and records failover time', () => {
      setActiveTarget(key, 'backup')
      const state = getFailoverState(key)
      expect(state.activeTarget).toBe('backup')
      expect(state.lastFailoverAt).not.toBeNull()
      expect(state.consecutiveFailures).toBe(0)
    })

    it('sets target to primary and records recovery time', () => {
      setActiveTarget(key, 'backup')
      setActiveTarget(key, 'primary')
      const state = getFailoverState(key)
      expect(state.activeTarget).toBe('primary')
      expect(state.lastRecoveryAt).not.toBeNull()
    })

    it('does not record failover when already on backup', () => {
      setActiveTarget(key, 'backup')
      const afterFirst = getFailoverState(key).lastFailoverAt
      setActiveTarget(key, 'backup')
      const afterSecond = getFailoverState(key).lastFailoverAt
      expect(afterSecond).toBe(afterFirst)
    })

    it('isolates state between different keys', () => {
      const otherKey = '+15553333333'
      setActiveTarget(key, 'backup')
      const state1 = getFailoverState(key)
      const state2 = getFailoverState(otherKey)
      expect(state1.activeTarget).toBe('backup')
      expect(state2.activeTarget).toBe('primary')
    })
  })

  describe('getActiveSignalConfig', () => {
    const failoverConfig = {
      enabled: true,
      backupBridgeUrl: 'http://backup:8080',
      backupBridgeApiKey: 'backup-key',
      backupRegisteredNumber: '+15552222222',
      backupWebhookSecret: 'backup-secret',
      failoverThreshold: 3,
      healthCheckIntervalSec: 60,
      autoRecover: true,
    }

    it('returns primary config when failover is disabled', () => {
      const config = getActiveSignalConfig(primaryConfig, { ...failoverConfig, enabled: false })
      expect(config.bridgeUrl).toBe(primaryConfig.bridgeUrl)
      expect(config.registeredNumber).toBe(primaryConfig.registeredNumber)
    })

    it('returns primary config when active target is primary', () => {
      const config = getActiveSignalConfig(primaryConfig, failoverConfig)
      expect(config.bridgeUrl).toBe(primaryConfig.bridgeUrl)
    })

    it('returns backup config when active target is backup', () => {
      setActiveTarget(key, 'backup')
      const config = getActiveSignalConfig(primaryConfig, failoverConfig)
      expect(config.bridgeUrl).toBe('http://backup:8080')
      expect(config.bridgeApiKey).toBe('backup-key')
      expect(config.registeredNumber).toBe('+15552222222')
      // Should preserve primary auto-response settings
      expect(config.autoResponse).toBe('Thank you for your message')
    })

    it('returns primary config when failover config is undefined', () => {
      setActiveTarget(key, 'backup')
      const config = getActiveSignalConfig(primaryConfig, undefined)
      expect(config.bridgeUrl).toBe(primaryConfig.bridgeUrl)
    })
  })

  describe('parseFailoverConfig', () => {
    it('returns defaults when no failover section', () => {
      const config = parseFailoverConfig(primaryConfig as SignalConfig & { failover?: Partial<FailoverConfig> })
      expect(config.enabled).toBe(false)
      expect(config.failoverThreshold).toBe(3)
      expect(config.autoRecover).toBe(true)
    })

    it('merges partial config with defaults', () => {
      const configWithFailover = {
        ...primaryConfig,
        failover: {
          enabled: true,
          backupBridgeUrl: 'http://backup:8080',
          backupBridgeApiKey: 'key',
          backupRegisteredNumber: '+15552222222',
          backupWebhookSecret: 'secret',
          failoverThreshold: 5,
        },
      }
      const result = parseFailoverConfig(configWithFailover)
      expect(result.enabled).toBe(true)
      expect(result.failoverThreshold).toBe(5)
      expect(result.autoRecover).toBe(true) // default preserved
      expect(result.healthCheckIntervalSec).toBe(60) // default preserved
    })
  })
})
