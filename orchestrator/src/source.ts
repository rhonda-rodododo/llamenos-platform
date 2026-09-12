import { ghJson } from './gh.js'

export interface WorkItem {
  id: string
  title: string
  body: string
  url: string
  labels: string[]
}

export interface RawIssue {
  number: number
  title: string
  body: string | null
  url: string
  state: string
  labels: { name: string }[]
}

export interface WorkSource {
  /** `undefined` means the read FAILED. `[]` means the backlog is empty. */
  list(): Promise<WorkItem[] | undefined>
  /** Labels read fresh at dispatch time, never from a cached list. */
  labels(id: string): Promise<string[] | undefined>
}

export function toWorkItem(raw: RawIssue): WorkItem {
  return {
    id: String(raw.number),
    title: raw.title,
    body: raw.body ?? '',
    url: raw.url,
    labels: raw.labels.map((l) => l.name),
  }
}

export function itemsFrom(raw: RawIssue[] | undefined): WorkItem[] | undefined {
  return raw === undefined ? undefined : raw.map(toWorkItem)
}

const FIELDS = 'number,title,body,url,state,labels'

export class GitHubSource implements WorkSource {
  constructor(private readonly requireLabel: string) {}

  async list(): Promise<WorkItem[] | undefined> {
    return itemsFrom(
      await ghJson<RawIssue[]>([
        'issue', 'list', '--state', 'open', '--label', this.requireLabel,
        '--limit', '200', '--json', FIELDS,
      ]),
    )
  }

  /**
   * Read per item at dispatch time. A label list captured during selection can
   * be minutes stale, and "someone added needs-human while we were deciding" is
   * exactly the case the veto exists for.
   */
  async labels(id: string): Promise<string[] | undefined> {
    const raw = await ghJson<{ labels: { name: string }[] }>(['issue', 'view', id, '--json', 'labels'])
    return raw === undefined ? undefined : raw.labels.map((l) => l.name)
  }
}
