import type { MessagingAdapter } from '../adapter'
import type { RCSConfig } from '@shared/types'
import { RCSAdapter } from './adapter'

export function createRCSAdapter(config: RCSConfig, hmacSecret: string): MessagingAdapter {
  return new RCSAdapter(config, hmacSecret)
}
