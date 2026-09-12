import { gh } from './gh.js'

export interface WorkSink {
  comment(id: string, body: string): Promise<void>
  addLabel(id: string, label: string): Promise<void>
  removeLabel(id: string, label: string): Promise<void>
}

export class GitHubSink implements WorkSink {
  async comment(id: string, body: string): Promise<void> {
    await gh(['issue', 'comment', id, '--body', body])
  }
  async addLabel(id: string, label: string): Promise<void> {
    await gh(['issue', 'edit', id, '--add-label', label])
  }
  async removeLabel(id: string, label: string): Promise<void> {
    await gh(['issue', 'edit', id, '--remove-label', label])
  }
}

/** Writes nothing. Used for shadow mode so a dry pass cannot mutate the board. */
export class NullSink implements WorkSink {
  async comment(): Promise<void> {}
  async addLabel(): Promise<void> {}
  async removeLabel(): Promise<void> {}
}
