# Staging (Internal Availability)

Decision for issue #718: **the existing demo deployment *is* the Internal
Availability staging backend.** No separate `staging` deployment profile,
inventory, or workflow is added. This is option (a) from #718 — see the
issue for the full option comparison; the short version is that a third
environment would duplicate the demo host's existing workflow, inventory
secret, vault, SSH key, and reset playbook for no benefit at this milestone,
and the demo host's "test data, can be wiped" semantics are exactly what an
internal tester should expect.

## What "demo is staging" means concretely

- **Hostname**: whatever hostname the `demo` inventory group already points
  at (`deploy/ansible/inventory-demo.yml`, populated from the
  `DEMO_INVENTORY_YML` GitHub secret — this repo does not check in a real
  hostname; a human with access to that secret must fill this section in
  with the actual value once decided).
- **`ENVIRONMENT`**: `demo` (rendered from `app_environment: demo` in
  `demo_vars.yml`), **not** `production` and **not** `development`.
- **`DEMO_MODE`**: `true`, with `demo_mode_confirm: "DESTROY_ALL_DATA"` set
  alongside it (see issue #716 — this is a two-factor confirmation
  `apps/worker/lib/config.ts` requires at startup before it will run
  scheduled data resets; both the app and an Ansible preflight assert
  refuse to start/deploy without it).
- The banner shown to testers is decided separately in issue #733.

## How to (re)deploy it

The demo/staging instance deploys via
`ansible-playbook playbooks/deploy-demo.yml`, driven by the
`Deploy Demo` GitHub Actions workflow
(`.github/workflows/deploy-demo.yml`, `workflow_dispatch` only). That
workflow writes the `DEMO_INVENTORY_YML`, `DEMO_VARS_YML_ENCRYPTED`,
`ANSIBLE_VAULT_PASSWORD` and `DEMO_SSH_PRIVATE_KEY` secrets to disk and
runs the playbook — no manual steps beyond triggering the workflow and
approving the `demo` GitHub environment.

To redeploy by hand against the same inventory:

```bash
cd deploy/ansible
ansible-playbook playbooks/deploy-demo.yml --ask-vault-pass
# or, with a non-default vars file:
ansible-playbook playbooks/deploy-demo.yml --ask-vault-pass -e demo_vars_file=../demo_vars.yml
```

`demo_vars.yml` (vault-encrypted, not checked in) must set at minimum:

```yaml
app_environment: demo
demo_mode: true
demo_mode_confirm: "DESTROY_ALL_DATA"
domain: <the staging hostname>
# ...plus every other secret preflight.yml requires (hmac_secret,
# server_secret, pg_password, storage_access_key, storage_secret_key)
```

Every `demo_vars.yml` run is checked by
`deploy/ansible/playbooks/tasks/guard-demo-mode.yml` (included from both
`preflight.yml` and `deploy-demo.yml`) before anything is rendered to disk:
it refuses to proceed if `demo_mode`, `dev_routes_enabled` or
`dev_reset_secret` are set while `app_environment` is `production`, and it
refuses to proceed if `demo_mode` is true without the exact
`demo_mode_confirm: "DESTROY_ALL_DATA"` two-factor value.

## Known gap: on-demand data reset does not currently work under `ENVIRONMENT=demo`

`playbooks/reset-demo.yml` calls `POST /api/test-reset` on the demo host.
That route (like every `/test-*` route) is gated by
`apps/worker/app.ts`'s `devGuard`, which requires **both**
`ENVIRONMENT=development` **and** `DEV_ROUTES_ENABLED=true`
(`apps/worker/app.ts:122-129`). Setting `app_environment: demo` — the value
this decision calls for — means that guard will 404 the reset call, even
with `dev_routes_enabled: true` set, until the guard is widened to also
accept `staging`/`demo`. That widening is tracked separately as **#723** and
is explicitly out of scope here. Until #723 lands, an operator who needs
`reset-demo.yml` to work today has to run the demo host with
`app_environment: development` instead of `demo`, which is a real tradeoff:
it keeps the manual reset working but reports a `development` environment
label rather than a `demo`/`staging` one. Whoever provisions the actual host
should pick one of the two knowingly rather than discover the 404 later.

## What's still needs-human here

- The actual hostname/DNS record testers will use.
- Filling in `DEMO_INVENTORY_YML` / `DEMO_VARS_YML_ENCRYPTED` with real
  values including `app_environment: demo` and `demo_mode: true` (today's
  content is unknown to this change — this PR does not have access to the
  live secrets and cannot confirm what the current demo host runs).
- Triggering the `Deploy Demo` workflow and capturing the live
  `curl -i https://<host>/health/ready`, `/health/live`, and `/api/config`
  evidence issue #718 asks for.
- Confirming issue #655 (production image cannot run migrations or serve
  HTTP) does not affect whatever image the demo host currently runs — this
  PR does not change the Docker image and cannot verify that independently.
