#!/usr/bin/env python3
"""Assert every Ansible template that renders the worker's .env carries every
env var apps/worker/lib/config.ts requires at Bun startup.

Context (issue #798): the repo has accumulated more than one Jinja template
that renders the worker's environment (one per deploy topology — the
deprecated monolithic `llamenos` role and the split `llamenos-app` role).
Nothing enforced that they stay in sync, so a var added to config.ts's
required list (or added to one template but not its sibling) could silently
leave a real deploy path unable to boot. This script parses the required-var
list out of config.ts itself — the single source of truth — and asserts every
listed template contains all of them, so a future drift fails CI loudly
instead of failing a real deploy quietly.

Only vars validateConfig() asserts *unconditionally* are checked here.
WEBHOOK_BASE_URL is required only when ENVIRONMENT=production (a runtime
value, not a template-time constant) and is intentionally not enforced by
this script — see apps/worker/lib/config.ts for that check.

Run from repo root or anywhere; paths below are repo-root-relative.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

CONFIG_TS = REPO_ROOT / "apps/worker/lib/config.ts"

# Every Ansible template that renders a full worker environment (either as a
# standalone .env file or as an embedded `environment:` block in a compose
# file). Add new ones here the moment they're introduced — that's the whole
# point of this gate.
TEMPLATES = [
    REPO_ROOT / "deploy/ansible/roles/llamenos/templates/env.j2",
    REPO_ROOT / "deploy/ansible/roles/llamenos/templates/docker-compose.j2",
    REPO_ROOT / "deploy/ansible/roles/llamenos-app/templates/env/app.j2",
    REPO_ROOT / "deploy/ansible/roles/llamenos-app/templates/compose/app.j2",
]

# Matches assertNonEmpty(env, 'KEY') / assertHex64(env, 'KEY') calls with a
# literal string key — deliberately does NOT match the generic internal call
# `assertNonEmpty(env, key)` inside assertHex64/assertDatabaseUrl themselves,
# since that argument is a variable, not a quoted literal.
REQUIRED_VAR_RE = re.compile(
    r"""assert(?:NonEmpty|Hex64)\(\s*env\s*,\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)"""
)


def extract_required_vars(config_ts: Path) -> set[str]:
    if not config_ts.is_file():
        print(f"ERROR: config source not found: {config_ts}", file=sys.stderr)
        sys.exit(2)

    text = config_ts.read_text()
    required = set(REQUIRED_VAR_RE.findall(text))

    # assertDatabaseUrl(env) hardcodes the 'DATABASE_URL' key internally
    # rather than taking it as an argument — special-cased here.
    if "assertDatabaseUrl(env)" in text:
        required.add("DATABASE_URL")

    if not required:
        print(
            f"ERROR: parsed zero required vars out of {config_ts} — "
            "the parser regex is stale relative to validateConfig()'s shape.",
            file=sys.stderr,
        )
        sys.exit(2)

    return required


def var_present(template_text: str, var: str) -> bool:
    return re.search(rf"\b{re.escape(var)}=", template_text) is not None


def main() -> int:
    required_vars = extract_required_vars(CONFIG_TS)
    print(f"Required vars from {CONFIG_TS.relative_to(REPO_ROOT)}: {sorted(required_vars)}")

    failures: list[tuple[Path, list[str]]] = []

    for template in TEMPLATES:
        if not template.is_file():
            print(f"ERROR: listed template not found: {template}", file=sys.stderr)
            return 2

        text = template.read_text()
        missing = sorted(v for v in required_vars if not var_present(text, v))
        if missing:
            failures.append((template, missing))

    if failures:
        print("\nFAIL: one or more templates are missing required env vars:\n", file=sys.stderr)
        for template, missing in failures:
            rel = template.relative_to(REPO_ROOT)
            print(f"  {rel}:", file=sys.stderr)
            for var in missing:
                print(f"    - {var}", file=sys.stderr)
        print(
            "\nEvery template listed in TEMPLATES must render every var "
            "apps/worker/lib/config.ts requires at startup, so no deploy "
            "topology can produce an env the app immediately refuses to "
            "boot with. Add the missing var(s), or if a template "
            "genuinely doesn't need one (e.g. it's not on that deploy "
            "path), remove it from TEMPLATES with a comment explaining why.",
            file=sys.stderr,
        )
        return 1

    print(f"\nOK: all {len(TEMPLATES)} templates carry all {len(required_vars)} required vars.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
