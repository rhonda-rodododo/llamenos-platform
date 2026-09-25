#!/usr/bin/env python3
"""Prove every disk-tier guard passes on a good layout and FIRES on a bad one.

The reference deployment runs two hosts: an encrypted one for the app, the
database and every secret, and an unencrypted one that runs only the ntfy push
relay (see docs/deployment/first-deploy.md, "Two hosts, two tiers"). The rule
is enforced by guards spread over preflight, the ntfy and Caddy roles, the
data-writing playbooks and the per-host role gating. An assertion nobody has
seen fail is not a control, so each case below either expects success or
injects the defect the guard exists for and expects the guard's own message.

Everything runs against localhost (`ansible_connection: local`, no become):
two inventory hosts that both point at this machine. No server is touched and
nothing is written outside a temp directory. Caddy cases need Docker.

Usage:
    python3 deploy/ansible/scripts/check-disk-tier-guards.py [--only GROUP ...]

GROUP is one of: preflight, guards, skip, gating (default: all).
"""
from __future__ import annotations

import getpass
import grp
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ANSIBLE_DIR = Path(__file__).resolve().parent.parent

HOSTS = {
    "llamenos-platform1": {"llamenos_disk_encrypted": True},
    "llamenos-relay1": {"llamenos_disk_encrypted": False},
}
GROUPS = {
    "llamenos_app": ["llamenos-platform1"],
    "llamenos_db": ["llamenos-platform1"],
    "llamenos_storage": ["llamenos-platform1"],
    "llamenos_proxy": ["llamenos-platform1", "llamenos-relay1"],
    "llamenos_ntfy": ["llamenos-relay1"],
}

# Valid values for every var preflight checks; dummy, never real credentials.
VALID_VARS = {
    "domain": "hotline.example.org",
    "acme_email": "ops@example.org",
    "llamenos_app_image": "llamenos:check-disk-tier",
    "app_environment": "production",
    "webhook_base_url": "https://api.hotline.example.org",
    "hmac_secret": secrets.token_hex(32),
    "server_secret": secrets.token_hex(32),
    "pg_password": secrets.token_urlsafe(24),
    "storage_access_key": secrets.token_hex(16),
    "storage_secret_key": secrets.token_urlsafe(24),
    "ssh_allowed_cidrs": ["203.0.113.7/32"],
    "llamenos_ntfy_enabled": True,
    "ntfy_domain": "push.hotline.example.org",
    "llamenos_dns_validation_enabled": False,
    "demo_mode": False,
    "dev_routes_enabled": False,
    "dev_reset_secret": "",
}


def inventory(hosts: dict | None = None, groups: dict | None = None, host_addr: dict | None = None) -> dict:
    hosts = HOSTS if hosts is None else hosts
    groups = GROUPS if groups is None else groups
    host_addr = host_addr or {}
    return {
        "all": {
            "vars": {
                "ansible_connection": "local",
                "ansible_become": False,
                "ansible_python_interpreter": sys.executable,
            },
            "children": {
                "llamenos_servers": {
                    "hosts": {
                        name: {"ansible_host": host_addr.get(name, "127.0.0.1"), **hv}
                        for name, hv in hosts.items()
                    }
                },
                **{g: {"hosts": {h: {} for h in members}} for g, members in groups.items()},
            },
        }
    }


class Runner:
    def __init__(self, tmp: Path):
        self.tmp = tmp
        self.failures: list[str] = []
        self.n = 0

    def run(self, playbook: str, inv: dict, extra: dict, *args: str, env: dict | None = None):
        self.n += 1
        inv_path = self.tmp / f"inv-{self.n}.json"
        inv_path.write_text(json.dumps(inv))
        vars_path = self.tmp / f"vars-{self.n}.json"
        vars_path.write_text(json.dumps({**VALID_VARS, **extra}))
        cmd = ["ansible-playbook", playbook, "-i", str(inv_path), "-e", f"@{vars_path}", *args]
        proc = subprocess.run(
            cmd, cwd=ANSIBLE_DIR, capture_output=True, text=True, stdin=subprocess.DEVNULL,
            env={**os.environ, "ANSIBLE_NOCOLOR": "1", "ANSIBLE_FORCE_COLOR": "0", **(env or {})},
        )
        self.last_stdout = proc.stdout
        return proc.returncode, proc.stdout + proc.stderr

    def expect(self, name: str, rc_ok: bool, out: str, rc: int, must: list[str] = (), must_not: list[str] = ()):
        problems = []
        if rc_ok and rc != 0:
            problems.append(f"expected success, got rc={rc}")
        if not rc_ok and rc == 0:
            problems.append("expected the guard to FAIL, but the run succeeded")
        problems += [f"missing expected text: {m!r}" for m in must if m not in out]
        problems += [f"unexpected text present: {m!r}" for m in must_not if m in out]
        if problems:
            self.failures.append(name)
            print(f"FAIL  {name}")
            for p in problems:
                print(f"        {p}")
            tail = "\n".join(out.strip().splitlines()[-25:])
            print("        --- last output ---\n" + "\n".join("        " + l for l in tail.splitlines()))
        else:
            print(f"ok    {name}")


def preflight_cases(r: Runner) -> None:
    pf = "playbooks/preflight.yml"
    # Start at the variable-validation play: the first play checks THIS machine
    # (distribution, free disk, SSH), which says nothing about the guards and
    # fails on an unsupported workstation distro or inside a container.
    real_run = r.run

    def run(playbook, inv, extra, *args, **kw):
        return real_run(playbook, inv, extra, "--start-at-task", "Print deployment target summary", *args, **kw)

    r.run = run  # type: ignore[method-assign]

    rc, out = r.run(pf, inventory(), {})
    r.expect("preflight: two-tier layout passes", True, out, rc,
             must=["llamenos-relay1: llamenos_disk_encrypted=False", "ALL PREFLIGHT CHECKS PASSED"])

    g = {**GROUPS, "llamenos_db": ["llamenos-platform1", "llamenos-relay1"]}
    rc, out = r.run(pf, inventory(groups=g), {})
    r.expect("preflight: unencrypted host in llamenos_db is refused", False, out, rc,
             must=["REFUSING TO DEPLOY: llamenos-relay1", "the `llamenos_db` service", "PostgreSQL database"])

    g = {**GROUPS, "llamenos_app": ["llamenos-platform1", "llamenos-relay1"]}
    rc, out = r.run(pf, inventory(groups=g), {})
    r.expect("preflight: unencrypted host in llamenos_app is refused", False, out, rc,
             must=["the `llamenos_app` service"])

    g = {**GROUPS, "llamenos_storage": []}
    rc, out = r.run(pf, inventory(groups=g), {})
    r.expect("preflight: empty llamenos_storage (falls back to every host) is refused", False, out, rc,
             must=["the `llamenos_storage` service", "group is empty"])

    g = {**GROUPS, "llamenos_signal": ["llamenos-relay1"]}
    rc, out = r.run(pf, inventory(groups=g), {"llamenos_signal_enabled": True,
                                                "signal_notifier_bearer_token": secrets.token_hex(32)})
    r.expect("preflight: Signal sidecar on the unencrypted host is refused", False, out, rc,
             must=["the `llamenos_signal` service"])

    rc, out = r.run(pf, inventory(), {"llamenos_internal_tls_enabled": True})
    r.expect("preflight: internal TLS keys on the unencrypted host are refused", False, out, rc,
             must=["llamenos_internal_tls_enabled is true"])

    h = {**HOSTS, "llamenos-relay1": {}}
    rc, out = r.run(pf, inventory(hosts=h), {})
    r.expect("preflight: a host without llamenos_disk_encrypted is refused", False, out, rc,
             must=["REQUIRED: set `llamenos_disk_encrypted: true` or `false`"])

    h = {**HOSTS, "llamenos-relay1": {"llamenos_disk_encrypted": "false"}}
    rc, out = r.run(pf, inventory(hosts=h), {})
    r.expect("preflight: a string 'false' (not a YAML boolean) is refused", False, out, rc,
             must=["REQUIRED: set `llamenos_disk_encrypted: true` or `false`"])

    # Per-host DNS: the relay must resolve push.<domain> to ITSELF and is not
    # asked about the API names. `localhost` is the one name that resolves the
    # same on every machine, so it stands in for push.<domain>.
    dns = {"llamenos_dns_validation_enabled": True, "ntfy_domain": "localhost"}
    rc, out = r.run(pf, inventory(), dns, "--limit", "llamenos-relay1")
    r.expect("preflight: relay DNS checks only ntfy_domain, resolving to the relay", True, out, rc,
             must=["(item=localhost)"], must_not=["(item=api.hotline.example.org)", "(item=hotline.example.org)"])

    rc, out = r.run(pf, inventory(host_addr={"llamenos-relay1": "127.0.0.2"}), dns, "--limit", "llamenos-relay1")
    r.expect("preflight: ntfy_domain resolving elsewhere than the relay is refused", False, out, rc,
             must=["DNS mismatch: localhost resolves to", "expected this server's address 127.0.0.2"])
    r.run = real_run  # type: ignore[method-assign]


def harness_cases(r: Runner) -> None:
    if not shutil.which("docker"):
        r.failures.append("guards")
        print("FAIL  guards: docker not found (the Caddy cases adapt the Caddyfile with Caddy itself)")
        return
    pb = "playbooks/check-disk-tier-guards.yml"
    cases = [
        ("ntfy_clean", True, ["no persistent cache, attachments or log file"]),
        ("ntfy_cache_file", False, ["REFUSING TO DEPLOY: the ntfy service on llamenos-relay1", "Offending setting(s): CACHE_FILE"]),
        ("caddy_relay", True, ["Caddy on llamenos-relay1: no access log"]),
        ("caddy_access_log", False, ["would write\nclient addresses or device topics to disk", "Servers with an access log"]),
        ("caddy_no_filter", False, ["default logger encoder: none"]),
        ("caddy_platform", True, []),
    ]
    for case, ok, must in cases:
        rc, out = r.run(pb, inventory(), {"disk_tier_case": case})
        # fail_msg is YAML-folded into the JSON-ish result; compare on collapsed whitespace.
        flat = " ".join(out.split())
        r.expect(f"guard: {case}", ok, flat, rc, must=[" ".join(m.split()) for m in must])


def skip_cases(r: Runner) -> None:
    for pb, extra, first_task in [
        ("playbooks/backup.yml", {}, "Ensure backup base directory exists"),
        ("playbooks/restore.yml", {}, "Validate age key path"),
        ("playbooks/update.yml", {}, "Track current versions"),
        ("playbooks/rollback.yml", {}, "Pre-flight"),
        ("playbooks/observability.yml", {"observability_enabled": True}, "Validate observability is enabled"),
    ]:
        rc, out = r.run(pb, inventory(), extra, "--check", "--limit", "llamenos-relay1")
        r.expect(f"skip: {pb} ends for the unencrypted host before writing anything", True, out, rc,
                 must=["Skipping llamenos-relay1: llamenos_disk_encrypted is false"],
                 must_not=[f"TASK [{first_task}"])


def gating_case(r: Runner) -> None:
    """Service roles must skip per host. With the old `meta: end_play` the gate
    was evaluated for the first host only, so llamenos-relay1 (not in
    llamenos_db) ran the postgres role because llamenos-platform1 (first) is."""
    app_dir = r.tmp / "app"
    extra = {
        "app_dir": str(app_dir),
        "deploy_user": getpass.getuser(),
        "deploy_group": grp.getgrgid(os.getgid()).gr_name,
    }
    rc, out = r.run("playbooks/deploy.yml", inventory(), extra, "--check", "--tags", "postgres,ntfy",
                    env={"ANSIBLE_STDOUT_CALLBACK": "json"})
    try:
        # ansible.cfg also enables profile_tasks, which prints after the JSON document.
        stdout = r.last_stdout
        data, _ = json.JSONDecoder().raw_decode(stdout[stdout.index("{"):])
    except ValueError:
        r.expect("gating: roles run only on their own group's hosts", True, out, 1, must=["<json output>"])
        return
    ran: dict[str, set[str]] = {}
    for play in data.get("plays", []):
        for task in play.get("tasks", []):
            ran.setdefault(task["task"]["name"], set()).update(
                h for h, res in task["hosts"].items() if not res.get("skipped"))
    pg = ran.get("llamenos-postgres : Create postgres service directory", set())
    nt = ran.get("llamenos-ntfy : Create ntfy service directory", set())
    problems = []
    if pg != {"llamenos-platform1"}:
        problems.append(f"postgres service dir task ran on {sorted(pg)}, expected only llamenos-platform1")
    if nt != {"llamenos-relay1"}:
        problems.append(f"ntfy service dir task ran on {sorted(nt)}, expected only llamenos-relay1")
    if problems:
        r.failures.append("gating")
        print("FAIL  gating: roles run only on their own group's hosts")
        for p in problems:
            print(f"        {p}")
    else:
        print("ok    gating: postgres only on llamenos-platform1, ntfy only on llamenos-relay1")


def main() -> int:
    if not shutil.which("ansible-playbook"):
        print("ansible-playbook not found on PATH", file=sys.stderr)
        return 2
    groups = {"preflight": preflight_cases, "guards": harness_cases, "skip": skip_cases, "gating": gating_case}
    only = sys.argv[sys.argv.index("--only") + 1:] if "--only" in sys.argv else list(groups)
    unknown = [g for g in only if g not in groups]
    if unknown:
        print(f"unknown group(s): {unknown}; choose from {list(groups)}", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory(prefix="disk-tier-") as d:
        r = Runner(Path(d))
        for g in only:
            groups[g](r)
    print()
    if r.failures:
        print(f"{len(r.failures)} case(s) failed: {', '.join(r.failures)}")
        return 1
    print("all disk-tier guard cases behaved as expected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
