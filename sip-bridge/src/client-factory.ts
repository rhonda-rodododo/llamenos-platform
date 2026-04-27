import type { BridgeClient } from './bridge-client'
import type { BridgeConfig } from './types'
import { AriClient } from './clients/ari-client'
import { EslClient } from './clients/esl-client'
import { KamailioClient } from './clients/kamailio-client'

/**
 * Create the appropriate BridgeClient based on the PBX type in config.
 * Each PBX type only uses its relevant env vars — others are ignored.
 */
export function createBridgeClient(config: BridgeConfig): BridgeClient {
  switch (config.pbxType) {
    case 'asterisk':
      return new AriClient(config)

    case 'freeswitch':
      return new EslClient({
        host: config.eslHost,
        port: config.eslPort,
        password: config.eslPassword,
        connectionTimeoutMs: config.connectionTimeoutMs,
      })

    case 'kamailio':
      return new KamailioClient({
        jsonrpcUrl: config.kamailioJsonrpcUrl,
      })

    default:
      throw new Error(
        `Unknown PBX_TYPE: "${config.pbxType}". Must be "asterisk", "freeswitch", or "kamailio".`
      )
  }
}
