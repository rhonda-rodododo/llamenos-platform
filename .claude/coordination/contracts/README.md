# Interface contracts

A contract is a small, versioned promise about the shape of something one
domain owns and another domain depends on — "the backend's `/notes` response
carries field X, so iOS and Android must decode it that way," or "the hub
key wrap format is Y, so any client wrapping or unwrapping it must agree."

## Why these live in git, not in a GitHub comment or a status page

A contract is only useful if it is true **at a commit**. A worker checked
out at commit `abc123` needs to know what the interface looked like at
`abc123` — not what it looks like on `main` right now, and not what a human
typed into a PR comment yesterday, which that worker's checkout cannot see
and has no way to correlate with its own tree.

Concretely:

- When the interface changes, the contract changes **in the same PR** that
  changes the code. There is no window where the code and the contract
  disagree, because they are the same commit.
- A worker briefed from an old branch reads the contract as it existed when
  that branch was cut — an accurate description of the code it actually has
  checked out, not a description of code three merges ahead of it.
- Git history is the audit trail: `git log` on a contract file shows exactly
  when an interface promise changed and in which PR, the same way it does
  for any other source file.

A GitHub issue comment or a wiki page has none of these properties — it is
mutable outside of any commit, unpinned to any particular tree state, and
read identically regardless of which commit the reader is actually on. That
is exactly backwards for a promise whose entire value is "this was true
here."

## Format

Each contract is a single Markdown file in this directory with YAML front
matter:

```md
---
title: Hub-key wrap envelope shape
owner: shared-supervisor
governs:
  - packages/protocol/schemas/hub-key.ts
  - apps/desktop/src/
  - apps/ios/Sources/Services/HubKey*.swift
---

The hub key wrap envelope is HPKE-sealed per recipient under
`LABEL_HUB_KEY_WRAP`. Any platform that reads or writes this envelope must
treat the `v` field as the format version and reject anything it does not
recognize rather than guessing.
```

- `title` — short, human-readable name for the contract.
- `owner` — the lane responsible for keeping this contract accurate (matches
  a lane id from `orchestrator/src/config.ts`).
- `governs` — a list of path globs. Any diff or scope that touches one of
  these paths gets this contract's body added to its brief, via
  `orchestrator/src/memory.ts`'s `loadContracts` / `contractsFor`. Globs use
  the same matching rules as lane scope (`matchesPath` in
  `orchestrator/src/fragments.ts`) — reuse that matcher, do not write a
  second one.
- The body (everything after the closing `---`) is the promise itself. Keep
  it specific enough that a worker reading it can tell whether their change
  violates it.

## Updating a contract

Change it in the same commit or PR that changes the interface it describes.
A contract that lags its own interface is worse than no contract: it briefs
workers with a promise the code has already broken.
