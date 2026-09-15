import { gh, ghJson, REPO } from './gh.js'

export interface SinkComment {
  /** Numeric REST comment id (parsed from the comment's `url`), not the
   *  GraphQL node id `gh issue view` also returns — the REST id is what
   *  `gh api .../issues/comments/{id}` (used by `editComment`) expects. */
  id: string
  body: string
}

export interface WorkSink {
  comment(id: string, body: string): Promise<void>
  addLabel(id: string, label: string): Promise<void>
  removeLabel(id: string, label: string): Promise<void>
  /** Oldest first, matching `gh issue view --json comments`'s own order.
   *  Issue #838: idempotent digest posting (`digest-issue.ts`) needs to find
   *  its own prior comment before deciding whether to create or edit. */
  listComments(id: string): Promise<SinkComment[]>
  /** Edits an existing comment in place by id — see `SinkComment.id`. */
  editComment(id: string, body: string): Promise<void>
}

interface GhIssueComment {
  url: string
  body: string
}

/** The REST numeric id lives only in the comment's URL fragment
 *  (`#issuecomment-<id>`) in `gh issue view --json comments`'s output —
 *  there is no separate numeric-id field to read directly. */
function commentIdFromUrl(url: string): string | undefined {
  return /#issuecomment-(\d+)$/.exec(url)?.[1]
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
  async listComments(id: string): Promise<SinkComment[]> {
    const view = await ghJson<{ comments: GhIssueComment[] }>(['issue', 'view', id, '--json', 'comments'])
    if (view === undefined) return []
    const out: SinkComment[] = []
    for (const c of view.comments) {
      const commentId = commentIdFromUrl(c.url)
      if (commentId !== undefined) out.push({ id: commentId, body: c.body })
    }
    return out
  }
  async editComment(id: string, body: string): Promise<void> {
    await gh(['api', `repos/${REPO}/issues/comments/${id}`, '-X', 'PATCH', '-f', `body=${body}`])
  }
}

/** Writes nothing. Used for shadow mode so a dry pass cannot mutate the board. */
export class NullSink implements WorkSink {
  async comment(): Promise<void> {}
  async addLabel(): Promise<void> {}
  async removeLabel(): Promise<void> {}
  async listComments(): Promise<SinkComment[]> { return [] }
  async editComment(): Promise<void> {}
}
