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

/**
 * "Nothing there" and "could not look" are different facts, and this type
 * makes them impossible to confuse — or to drop. `undefined` carried the
 * distinction but not the REASON, so an abort could say only that the source
 * was unreadable, never why. `detail` is that why, in one line.
 */
export type ListResult =
  | { ok: true; items: WorkItem[] }
  | { ok: false; detail: string }

export interface WorkSource {
  list(): Promise<ListResult>
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

  async list(): Promise<ListResult> {
    let failure: string | undefined
    const raw = await ghJson<RawIssue[]>(
      [
        'issue', 'list', '--state', 'open', '--label', this.requireLabel,
        '--limit', '200', '--json', FIELDS,
      ],
      undefined,
      (detail) => { failure = detail },
    )
    if (raw === undefined) {
      // `ghJson` only returns undefined after a failure, so `failure` is set —
      // the fallback names the one case that would otherwise print "undefined"
      // and send the next reader down the same blind alley this exists to end.
      return { ok: false, detail: failure ?? 'gh returned no JSON and reported no error' }
    }
    return { ok: true, items: raw.map(toWorkItem) }
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
