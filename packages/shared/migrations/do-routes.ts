/**
 * Shared migration route handlers for Durable Objects.
 * Registers /migrations/status and /migrations/rollback on a DORouter.
 */
import type { MigrationStorage } from './types'
import { getMigrationStatus, rollbackMigration } from './runner'
import { migrations } from './index'

interface DORouterLike {
  get(path: string, handler: (req: Request) => Promise<Response> | Response): void
  post(path: string, handler: (req: Request) => Promise<Response> | Response): void
}

/**
 * Register migration management routes on a DO router.
 * @param router - The DORouter instance
 * @param storage - The DO's storage (this.ctx.storage)
 * @param namespace - The namespace label for logging
 */
export function registerMigrationRoutes(
  router: DORouterLike,
  getStorage: () => MigrationStorage,
  namespace: string,
): void {
  router.get('/migrations/status', async () => {
    const status = await getMigrationStatus(getStorage(), migrations)
    return Response.json({ namespace, ...status })
  })

  router.post('/migrations/rollback', async () => {
    try {
      const result = await rollbackMigration(getStorage(), migrations, namespace)
      if (!result) {
        return Response.json({ error: 'Nothing to roll back — already at version 0' }, { status: 400 })
      }
      return Response.json({ namespace, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rollback failed'
      return Response.json({ error: message }, { status: 400 })
    }
  })
}
