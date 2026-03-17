/**
 * Task scheduling table: scheduled tasks with partial index
 * for unclaimed task polling.
 */
import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// scheduled_tasks
// ---------------------------------------------------------------------------

export const scheduledTasks = pgTable(
  'scheduled_tasks',
  {
    id: text('id').primaryKey(),
    taskType: text('task_type').notNull(),
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (table) => [
    index('scheduled_tasks_unclaimed_idx')
      .on(table.runAt)
      .where(sql`claimed_at IS NULL`),
  ],
)
