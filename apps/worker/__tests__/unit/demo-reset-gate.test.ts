import { describe, it, expect } from 'vitest'
import { demoResetRefusal, type DemoResetGateEnv } from '@worker/lib/demo-reset-gate'

const OK: DemoResetGateEnv = {
  ENVIRONMENT: 'demo',
  DEMO_MODE: 'true',
  DEMO_MODE_CONFIRM: 'DESTROY_ALL_DATA',
}

describe('demoResetRefusal', () => {
  it('allows a demo deployment that set both flags', () => {
    expect(demoResetRefusal(OK)).toBeNull()
  })

  it.each(['development', 'staging', 'demo'])('allows ENVIRONMENT=%s with both flags', (environment) => {
    expect(demoResetRefusal({ ...OK, ENVIRONMENT: environment })).toBeNull()
  })

  it('refuses without DEMO_MODE', () => {
    expect(demoResetRefusal({ ...OK, DEMO_MODE: undefined })).toMatch(/DEMO_MODE=true/)
    expect(demoResetRefusal({ ...OK, DEMO_MODE: 'false' })).toMatch(/DEMO_MODE=true/)
    expect(demoResetRefusal({ ...OK, DEMO_MODE: 'TRUE' })).toMatch(/DEMO_MODE=true/)
  })

  it('refuses without the exact confirmation', () => {
    expect(demoResetRefusal({ ...OK, DEMO_MODE_CONFIRM: undefined })).toMatch(/DEMO_MODE_CONFIRM/)
    expect(demoResetRefusal({ ...OK, DEMO_MODE_CONFIRM: 'destroy_all_data' })).toMatch(/DEMO_MODE_CONFIRM/)
    expect(demoResetRefusal({ ...OK, DEMO_MODE_CONFIRM: 'true' })).toMatch(/DEMO_MODE_CONFIRM/)
  })

  it('refuses when nothing is configured', () => {
    expect(demoResetRefusal({})).not.toBeNull()
  })

  describe('production', () => {
    // Every other flag set to the value that would otherwise permit the reset.
    const permissive: DemoResetGateEnv = { DEMO_MODE: 'true', DEMO_MODE_CONFIRM: 'DESTROY_ALL_DATA' }

    it.each(['production', 'Production', ' PRODUCTION '])('always refuses ENVIRONMENT=%j', (environment) => {
      expect(demoResetRefusal({ ...permissive, ENVIRONMENT: environment })).toMatch(/production/)
    })

    it('refuses even with extra dev/demo flags present', () => {
      const env = {
        ...permissive,
        ENVIRONMENT: 'production',
        DEV_ROUTES_ENABLED: 'true',
        DEV_RESET_SECRET: 'x',
        E2E_TEST_SECRET: 'y',
      } as DemoResetGateEnv
      expect(demoResetRefusal(env)).toMatch(/production/)
    })

    it('reports production first, ahead of missing demo flags', () => {
      expect(demoResetRefusal({ ENVIRONMENT: 'production' })).toMatch(/production/)
    })
  })
})
