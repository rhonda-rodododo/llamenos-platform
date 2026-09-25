# First deploy: fresh VPS → running platform

The exact, ordered procedure for taking a brand-new VPS to a running Llámenos
server (app + API, Postgres, RustFS object storage, Caddy TLS, ntfy push relay,
desktop-updater origin, backups). Every command below was checked against the
files in this repository; where something could **not** be verified without a
real server it is called out under [What only a real server will prove](#what-only-a-real-server-will-prove).

Companion documents (this one is the map; those hold the detail):

| Document | Covers |
|---|---|
| [`iso-install.md`](iso-install.md) | Building and installing the full-disk-encryption (FDE) installer ISO, LUKS unlock |
| [`../runbooks/deploy-official.md`](../runbooks/deploy-official.md) | Day-2 deploys of the official profile, GitHub Actions deploy |
| [`../runbooks/dns-migration.md`](../runbooks/dns-migration.md) | Moving an existing zone to the new DNS host |
| [`../runbooks/desktop-update-release.md`](../runbooks/desktop-update-release.md) | Publishing desktop updates to the self-hosted origin |
| [`../runbooks/disaster-recovery.md`](../runbooks/disaster-recovery.md) | Backups, restore, DR test |

---

## 1. Choosing a host: two hard requirements

Host selection is constrained by two properties. Both are security properties of
the deployment, not conveniences; a host that cannot meet them is not a
candidate however cheap or well-located it is.

**(a) Custom ISO boot and a remote console.** Full-disk encryption with remote
LUKS unlock only works if you can boot *our* installer ISO and type the LUKS
passphrase at a console. A provider that only offers its own OS images, or has
no VNC/iKVM console, cannot do this, and FDE-with-remote-unlock does not
transfer to it.

**(b) TLS terminates on your own box, with a Let's Encrypt (ISRG-chained)
certificate.** The Android client pins ISRG Root X1/X2 and **hard-fails**
(`apps/android/app/src/main/res/xml/network_security_config.xml`, plus an
OkHttp `CertificatePinner` in `ApiService.kt`; no soft-fail, no cleartext
fallback). A CDN, reverse-proxy product, "managed TLS" or any provider feature
that terminates TLS in front of the VPS presents a different certificate chain,
and **Android will not connect at all**. Concretely: no Cloudflare proxy
("orange cloud"), no provider load balancer, no TLS-terminating DDoS shield. DNS
records for this deployment must be DNS-only.

A third, policy constraint: provider jurisdiction must pass the strict test in
[`iso-install.md` → Choosing a provider](iso-install.md#choosing-a-provider)
(zero US operations).

| Host | Custom ISO + console | Status |
|---|---|---|
| **1984 Hosting** (Iceland) | Yes — ISO attached by **support ticket** (URL + SHA-256), noVNC console. FDE install verified 2026-04-19. | Primary. Also hosts authoritative DNS. |
| **FlokiNET** | **Unverified.** It is on the jurisdiction "clean list", but nobody has confirmed it offers custom-ISO boot *and* a remote console. If it does not, FDE with remote unlock is not achievable there. | Open question — verify before ordering; do not assume. |

The OpenTofu module `deploy/opentofu/modules/1984hosting/` is a **runbook, not
automation** (1984 has no OpenTofu provider). You do not need OpenTofu at all;
this document is the supported path.

---

## 2. What you need before you start

**Workstation** (Linux/macOS; nothing here runs on the server until Ansible does):

```bash
# Ansible. CI validates with ansible==14.1.0 (the full package, which bundles
# community.docker, community.general and ansible.posix).
pipx install ansible          # or: pip install --user ansible

# Only needed if you installed ansible-core instead of the full package:
ansible-galaxy collection install community.docker community.general ansible.posix

docker --version              # to build the FDE ISO and the app image
bun --version                 # `bun run build:iso`, `bun run bootstrap-admin`
just --version                # optional; the justfile is a thin wrapper over ansible-playbook
age-keygen --help >/dev/null  # backup encryption key (step 4)
```

**Accounts / inputs** you must supply (nothing in this repo can guess them):

| Input | Where it goes |
|---|---|
| Domain you control (apex), authoritative DNS you can edit | `domain` in `vars-production.yml` |
| Email for Let's Encrypt notices | `acme_email` |
| VPS public **IPv4**, plus netmask/CIDR and gateway (1984 needs static IP at install time), disk device (1984 KVM: `/dev/vda`) | `ansible_host` in inventory; ISO build flags |
| Your admin machine's public egress IP(s) | `ssh_allowed_cidrs` |
| An ed25519 SSH key pair for the `deploy` user | ISO build flag `--ssh-key`; `ansible_ssh_private_key_file` |
| A LUKS passphrase (30+ chars, in a password manager — **no recovery exists**) | typed at the console during install |
| An Ansible **vault password** | see [What the vault password is for](#what-the-vault-password-is-for) |
| A published app container image | see [Getting the app image onto the server](#getting-the-app-image-onto-the-server) |

### Resolve these blockers *before* deploy day

Found while validating this procedure without a server. They are real and each
one stops or silently degrades the deploy:

1. **The default app image does not exist.** `llamenos_app_image` defaults to
   `docker.io/llamenos/llamenos:latest`; that repository does not resolve, the
   `Docker Build` workflow has only ever run once (failed, 2026-04-29), and it
   never pushes a `latest` tag anyway. You **must** set `llamenos_app_image`
   explicitly — see [Getting the app image onto the server](#getting-the-app-image-onto-the-server).
2. **Android pins `llamenos.org` only.** `network_security_config.xml` has a
   single `<domain-config>` for `llamenos.org` (with `includeSubdomains`). If the
   production domain becomes `llamenos-hotline.org`, that file (and the
   OkHttp/URLSession defaults) must be updated in the same change that moves the
   domain — otherwise the OS-level pin-set does not apply to the new hostnames.
   The app-level `CertificatePinner` already applies the ISRG pins to whatever hub
   host the user configures. Note the `pin-set expiration="2027-01-01"`.
3. **The desktop update manifest generator produces an empty manifest** for the
   real release artifacts (see [Serving desktop updates](#serving-desktop-updates-from-this-box)).
   The updater channel cannot work — on any host — until that is fixed.

---

## 3. The sequence

Working directory for every `ansible-playbook` command: `deploy/ansible/`.

### Step 1 — Order the VPS and record its network parameters

Order the VPS (the OS you pick is wiped by the FDE install). Note the **IPv4
address, prefix length/netmask, gateway, IPv6 (if any)** and the **disk device**.
Sizing floor from `docs/runbooks/deploy-self-hosted.md`: ≥ 2 vCPU, 4 GB RAM,
40 GB disk (preflight enforces ≥ 10 GiB free on `/` and ≥ 512 MiB free RAM).

### Step 2 — FDE install (Debian 13, LUKS2 + dropbear remote unlock)

Full detail in [`iso-install.md`](iso-install.md). The ordered essentials for 1984:

```bash
# from the repo root, on your workstation
bun run build:iso \
  --hostname llamenos-01 \
  --ssh-key ~/.ssh/<key>.pub \
  --disk /dev/vda \
  --static-ip <ipv4>/<prefix> \
  --gateway <gateway>
```

1984 does not run DHCP during install; without `--static-ip`/`--gateway` the
installer hangs silently at "Configure the network". Then: host the ISO at a
public HTTPS URL → support ticket to 1984 with the URL and the SHA-256 from
`dist/iso/*.sha256` → boot the VPS from it → in the noVNC console type the LUKS
passphrase when asked → wait for the install to finish and reboot → **detach the
ISO** in the panel.

Every boot then pauses in the initramfs. Unlock from your workstation:

```bash
ssh -p 2222 -i ~/.ssh/<key> root@<ipv4>     # prompts for the LUKS passphrase, then disconnects
```

(The login user is `root`, not `deploy`: dropbear runs a single forced command,
`cryptroot-unlock`. Dropbear's host key differs from the post-install sshd's —
expect a separate `known_hosts` entry.)

Once it has booted, confirm the installer's `deploy` user works:

```bash
ssh -i ~/.ssh/<key> deploy@<ipv4> 'sudo -n true && echo sudo-ok'
```

### Step 3 — Create the DNS records (before deploying)

Caddy obtains certificates by ACME on first start, and preflight refuses to
proceed if a name does not resolve to the VPS, so the records must exist and
have propagated **first**. See [DNS records](#4-dns-records) for the table.

```bash
for h in api.<domain> <domain> updates.<domain> releases.<domain> push.<domain>; do
  printf '%s -> ' "$h"; dig +short "$h" A
done
```

### Step 4 — Write the two config files

```bash
cd deploy/ansible
cp inventory-production.example.yml inventory-production.yml   # gitignored
cp vars-production.example.yml     vars-production.yml         # gitignored
$EDITOR inventory-production.yml vars-production.yml
```

Never edit the tracked `vars.yml` / `inventory.yml`: they are committed
placeholders/defaults. `vars-production.yml` is passed with `-e @…` (extra-vars
win over everything, including the tracked `vars.yml` that every playbook also
loads), and both filled-in files are covered by `deploy/ansible/.gitignore`.

**`inventory-production.yml` — the four values**

| Key | Value |
|---|---|
| `ansible_host` | VPS public IPv4 (must be an IP, not a hostname — preflight's DNS check compares against it) |
| `ansible_user` | `deploy` (created by the installer ISO) |
| `ansible_ssh_private_key_file` | private half of the key you gave `--ssh-key` |
| `ansible_port` | `22` for the first run; **changed to `ssh_port` after step 6** |

**`vars-production.yml` — values you must fill in** (all secrets are shipped
empty so preflight fails loudly if one is forgotten):

| Key | Notes |
|---|---|
| `domain` | apex domain |
| `acme_email` | Let's Encrypt account email |
| `ssh_port` | template default `22022`. Avoid `2222` (the dropbear unlock port; different host key → constant host-key warnings) |
| `ssh_allowed_cidrs` | your admin egress IP(s) as CIDRs, e.g. `203.0.113.7/32` — the **only** sources UFW will let reach SSH. Preflight rejects placeholders. |
| `llamenos_app_image` | see next section |
| `hmac_secret` | `openssl rand -hex 32` |
| `server_secret` | `openssl rand -hex 32` (exactly 64 hex chars) |
| `pg_password` | `openssl rand -base64 24` |
| `storage_access_key` / `storage_secret_key` | `openssl rand -hex 16` / `openssl rand -base64 24` |
| `backup_age_public_key` | public half of `age-keygen -o backup-key.txt`; **keep the private key off the server** |
| `admin_pubkey` *(optional)* | `bun run bootstrap-admin`; otherwise bootstrap the first admin from the desktop app |

Everything else (`webhook_base_url`, `updates_domain`, `releases_domain`,
`ntfy_domain`, service toggles, pinned Postgres/Caddy image digests) is derived
or defaulted in the template. `just generate-secrets` prints a block of random
values you can paste from.

Encrypt it:

```bash
ansible-vault encrypt vars-production.yml     # asks for the vault password (twice)
ansible-vault view    vars-production.yml     # sanity-check it decrypts
```

#### What the vault password is for

It is the symmetric key that encrypts `vars-production.yml` **on your machine and
in git/CI storage** — that file holds every secret in the deployment (database
password, HMAC/server secrets, storage keys). It is used only by Ansible on the
control node to decrypt the vars at run time; it is never sent to the server. On
the server the secrets exist only as the rendered `0600` `.env` files under
`/opt/llamenos/services/*`. It does not protect the disk (that is the LUKS
passphrase) and it is not derived from anything: lose it and you cannot decrypt
`vars-production.yml` (you would regenerate and rotate the secrets). Keep it in a
password manager, out of the repo and out of shell history; pass it with
`--ask-vault-pass` interactively or `--vault-password-file` for automation. The
GitHub `deploy-prod.yml` workflow reads it from the `ANSIBLE_VAULT_PASSWORD`
environment secret.

### Getting the app image onto the server

Pick one. Either way, put the resulting reference in `llamenos_app_image`.

**A. Build locally and load it over SSH — no registry, no third party.** Verified
2026-09-25: builds in ~4½ min, `linux/amd64`, ~1.2 GB (~400 MB gzipped), and
contains `bun` (the container healthcheck uses it). **Pass `--target app`**: the
Dockerfile's last stage is the Caddy `static` image, and Docker builds the last
stage when none is named.

```bash
# repo root
docker build -f deploy/docker/Dockerfile --target app -t llamenos:<version> .
```

The server has no Docker until `harden.yml` has run (step 6), so load the image
*after* step 6 and *before* step 7:

```bash
docker save llamenos:<version> | gzip \
  | ssh -p <ssh_port> -i ~/.ssh/<key> deploy@<ipv4> 'docker load'
```

Use a bare `llamenos:<version>` tag. It resolves to Docker Hub's reserved
`library/` namespace, which nobody can register; never use `<someuser>/llamenos`
for a tag that is not actually published, because the role runs a `pull: always`
(errors ignored) before starting and would fetch whatever that namespace serves.

**B. Publish to a registry.** `.github/workflows/docker.yml` builds and pushes
`<DOCKERHUB_USERNAME>/llamenos:<version>` (with SBOM, SLSA provenance, cosign
signature, Trivy scan), but it needs the `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`
secrets and a successful run first. After that, pin by digest:
`llamenos_app_image: docker.io/<user>/llamenos:<version>@sha256:…`.

### Step 5 — Preflight (still on port 22, before any change to the server)

```bash
ansible-playbook playbooks/preflight.yml \
  -i inventory-production.yml -e @vars-production.yml -e deployment_profile=official \
  --ask-vault-pass
```

Checks the distribution (Debian ≥ 12 or Ubuntu 22.04/24.04), SSH reachability,
disk/RAM, every required variable and secret length, that demo/dev settings are
off, that `ssh_allowed_cidrs` are real CIDRs, and — because the profile is
`official` — that `api.<domain>`, the apex, `updates.`, `releases.` and `push.`
all resolve to `ansible_host`. Fix everything it reports before continuing.

### Step 6 — Harden (**always before deploy**)

```bash
ansible-playbook playbooks/harden.yml \
  -i inventory-production.yml -e @vars-production.yml --ask-vault-pass
```

Runs, in order: `common` (packages, chrony, unattended upgrades, `deploy` user),
`ssh-hardening`, `firewall` (UFW: deny-all + SSH on `ssh_port` from
`ssh_allowed_cidrs`, 80, 443/tcp, 443/udp), `kernel-hardening`, `fail2ban`,
`docker` (Docker CE, userns-remap, networks `llamenos-web`/`llamenos-internal`),
`security-scan`. Tags: `common ssh firewall kernel fail2ban docker security-scan`
(all also tagged `harden`).

**sshd moves to `ssh_port` and the old port closes.** The playbook restarts sshd
on the new port *before* it touches the firewall so a failure part-way cannot
leave you behind a firewall that admits only a port nothing listens on. Your
Ansible session survives; new connections do not use port 22. Immediately, in a
**second terminal, with the first still open**:

```bash
ssh -p <ssh_port> -i ~/.ssh/<key> deploy@<ipv4> 'echo reachable'
```

Then edit `inventory-production.yml`: `ansible_port: <ssh_port>`. Every later
command depends on this. (This is why the first run must not use the one-shot
`setup.yml`/`just setup-all`: it would attempt the deploy plays on the old port.)

If you locked yourself out (wrong `ssh_allowed_cidrs`, changed IP), the only
recovery is the provider's remote console.

### Step 7 — Load the app image (if you chose option A above)

Run the `docker save … | ssh … docker load` command from the image section now.

### Step 8 — Deploy

```bash
ansible-playbook playbooks/deploy.yml \
  -i inventory-production.yml -e @vars-production.yml -e deployment_profile=official \
  --ask-vault-pass
```

Order: service discovery → (internal TLS, off) → Docker → **Postgres → RustFS →
ntfy** → **app** → **Caddy** (+ whisper/asterisk/signal only if enabled) →
watchdog, NTP monitor, maintenance. Single-service reruns use tags: `postgres`,
`rustfs`, `ntfy`, `app`, `caddy`, `update-server`, `watchdog`, `ntp`,
`maintenance`, `docker`, `service-discovery`, `deploy`.

(Equivalent one-shot for *later* runs, once `ansible_port` is correct:
`./deploy/scripts/deploy-official.sh` runs `setup.yml` = preflight + harden +
deploy + smoke-check with the same flags.)

### Step 9 — Smoke check and verify

```bash
ansible-playbook playbooks/smoke-check.yml \
  -i inventory-production.yml -e @vars-production.yml -e deployment_profile=official \
  --ask-vault-pass
```

Then, from your workstation:

```bash
curl -fsS https://api.<domain>/api/health/ready
curl -fsS https://updates.<domain>/health            # "ok"
```

**Verify the certificate chain is ISRG-rooted** — the check that decides whether
Android can connect:

```bash
openssl s_client -connect api.<domain>:443 -servername api.<domain> -showcerts </dev/null 2>/dev/null \
  | grep -E '^( [0-9] s:|   i:)'
# leaf issuer must be a "Let's Encrypt" intermediate (R*/E*); the chain must
# terminate at ISRG Root X1 or X2. Anything else (ZeroSSL, Cloudflare, a
# provider CA) means TLS is not terminating where it must.
```

Caddy is configured with `acme_ca` set to Let's Encrypt only. (Caddy's default
would fall back to ZeroSSL when Let's Encrypt fails or rate-limits, whose chain
is not pinned — the fallback would look healthy in a browser and be a total
outage on Android. This was verified by adapting the Caddyfile: default = two
issuers, `acme_ca` = one.)

### Step 10 — Backups

```bash
ansible-playbook playbooks/backup.yml \
  -i inventory-production.yml -e @vars-production.yml --ask-vault-pass    # runs once and installs the cron schedule
ansible-playbook playbooks/backup-status.yml \
  -i inventory-production.yml -e @vars-production.yml --ask-vault-pass
```

When you have a moment: `playbooks/test-restore.yml` (non-destructive restore
test) and `playbooks/dr-test.yml`.

### Day 2

```bash
ansible-playbook playbooks/update.yml   -i inventory-production.yml -e @vars-production.yml --ask-vault-pass   # health-gated rolling update
ansible-playbook playbooks/rollback.yml -i inventory-production.yml -e @vars-production.yml --ask-vault-pass
```

**After every reboot** the box waits in the initramfs: `ssh -p 2222 root@<ipv4>`
and type the LUKS passphrase (step 2). Nothing else comes up until you do.

---

## 4. DNS records

Create these at your DNS host **before** deploying. **DNS-only — do not proxy
them** (requirement (b) above). All are `A` records to the VPS IPv4 (add `AAAA`
for each only if the VPS has IPv6 and you have confirmed it is reachable);
suggested TTL 300, lower to 60 before any migration.

| Name | Purpose | Required when |
|---|---|---|
| `api.<domain>` | The app: API, WebSocket, telephony/messaging webhooks. `webhook_base_url` points here. | Always |
| `<domain>` (apex) | Caddy serves a redirect to `api.<domain>` and requests a certificate for it | Always (preflight checks it; a missing record makes Caddy retry failing ACME orders) |
| `updates.<domain>` | Desktop auto-updater manifest: `https://updates.<domain>/desktop/latest.json` | `llamenos_update_server_enabled` (official profile) |
| `releases.<domain>` | Desktop updater artifacts (same tree; `tauri.conf.json` lists both hosts) | official profile |
| `push.<domain>` | ntfy / UnifiedPush broker. **Android has no FCM by design; without this, Android devices cannot be rung.** | `llamenos_ntfy_enabled` (on in the template) |

**Names your brief may have listed that nothing serves:** `app.` and `relay.`.
No role, Caddy vhost or health check in `deploy/ansible/` answers on either, and
`relay.` is treated as an *unrelated sibling origin* in the desktop network
guard tests (`apps/desktop/src/net.rs`). Do not create them unless you also add a
vhost. (`app.llamenos.org` still appears as a default CORS origin and in some
sample URLs; this deployment serves the app on `api.<domain>` and clients enter
that hub URL.)

A separate change is moving these records to `llamenos-hotline.org`: the names
above are relative to `domain`, and `tauri.conf.json`'s updater endpoints and
`scripts/generate-update-manifest.sh`'s default base URL are still hard-coded to
`llamenos.org`. Moving an existing zone: [`dns-migration.md`](../runbooks/dns-migration.md).

---

## 5. Serving desktop updates from this box

The GitHub Releases (`desktop-v<version>`, `android-v<version>`) always work and
need nothing from this box. The self-hosted origin is an *additional* channel for
the in-app updater.

### How it is served

`updates.<domain>` and `releases.<domain>` are vhosts of the single Caddy, which
bind-mounts `/opt/llamenos/services/update-server/artifacts` read-only at
`/srv/updates`. Layout (matches `tauri.conf.json` endpoints and the URLs inside
the manifest):

```
artifacts/desktop/latest.json                # https://updates.<domain>/desktop/latest.json
artifacts/desktop/v<version>/<installer>     # https://releases.<domain>/desktop/v<version>/<installer>
artifacts/desktop/v<version>/<installer>.sig
```

Only `/desktop/*` and `/health` are served. (A previous version of this role ran
a second Caddy on `127.0.0.1:3080/3443`: it could never complete ACME, nothing
routed public traffic to it, and it crash-looped on `read_only: true` — verified.
It is gone.) Populate the directory as in
[`desktop-update-release.md`](../runbooks/desktop-update-release.md).

### What RustFS needs — report

`.github/workflows/tauri-release.yml` publishes to a **second channel only when
all five secrets are set** (none set → skipped cleanly; some but not all →
the job fails; that is intentional). What they must contain:

| Secret | Contents |
|---|---|
| `RUSTFS_ENDPOINT` | An S3 endpoint **reachable from GitHub-hosted runners over the internet**. The RustFS on this box is deliberately private (Docker network only, no published port), so this cannot be it as deployed. |
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` | S3 credentials with write access to the bucket below. |
| `RUSTFS_STAGING_BUCKET` | Bucket **name** (no default; the workflow does not create it). |
| `RELEASES_REPO_PAT` | Fine-grained PAT with write access to the GitHub repo `rhonda-rodododo/llamenos-releases`. |

Written by CI (`aws s3 cp --endpoint-url $RUSTFS_ENDPOINT`):

```
s3://<RUSTFS_STAGING_BUCKET>/desktop/v<version>/<every installer, .sig, CHECKSUMS…>
s3://<RUSTFS_STAGING_BUCKET>/desktop/v<version>/latest.json
s3://<RUSTFS_STAGING_BUCKET>/desktop/latest.json
```

**This is the same `desktop/…` tree the Caddy vhost serves from disk**, so CI's
output is directly usable — the missing piece is only how the bytes get from the
bucket to the box's filesystem, and that is a choice:

1. **Recommended: leave the five secrets unset**, and publish to the box by
   `rsync` over SSH (the documented manual path). No public S3 endpoint, so
   RustFS stays private; the GitHub Release stays the automated channel.
2. Expose RustFS's S3 API publicly (a vhost with the original `Host` header
   preserved — SigV4 signs it) so CI can write and Caddy can proxy reads from a
   public-read prefix. Works, but publishes the object store's API to the
   internet on a deployment whose threat model includes well-funded adversaries.
   Not done here.

**Is the `llamenos-releases` metadata repo still required?** *As the workflow is
written, yes* — `RELEASES_REPO_PAT` is one of the five, the "push access" probe
runs before any upload, and `verify-release-live.yml`, `verify-build.sh`, the
release notes and `site/src/config.ts` read checksums/SBOM from it. It holds
`desktop/v<version>/{CHECKSUMS.txt,sbom-desktop.cdx.json,build-info.json,latest.json}`
— a public transparency log, not something the updater needs. **It could be
replaced by the self-hosted tree** (those four files are already generated and
could sit beside the installers under `desktop/v<version>/`), but that means
changing the workflow and its four consumers — a separate change. Nothing was
changed here.

### Two defects that block the updater channel regardless of hosting

Reproduced against the real `desktop-v0.19.16` release assets:

* **`scripts/generate-update-manifest.sh` emits `"platforms": {}`.** It looks for
  `*.app.tar.gz.sig`, `*.nsis.zip.sig`, `*.AppImage.tar.gz.sig`; the release ships
  `Hotline_0.19.16_amd64.AppImage.sig`, `Hotline_0.19.16_x64-setup.exe.sig`,
  `Hotline_0.19.16_x64_en-US.msi.sig` (and `.deb`/`.rpm`). The workflow's own
  "Verify latest.json covers every platform" step would fail the job once the
  channel is enabled. Needs a fix in `scripts/` (and macOS is excluded from the
  release until Apple signing lands).
* **Base URL is not set by the workflow.** `RUSTFS_PUBLIC_URL` is read by the
  script but never provided, so URLs default to `https://releases.llamenos.org`.
  It must be set to `https://releases.<domain>` (a repository variable) once the
  domain is decided, together with `tauri.conf.json`'s `endpoints`.

Signatures are minisign over the installers, verified by the app against the
pubkey embedded in `tauri.conf.json`, so a compromised or misconfigured host
cannot push a malicious update — but it can strand users on an old version.

---

## What only a real server will prove

Everything below was **not** exercisable without a host. It is listed so the first
real run knows where to look:

* The FDE install itself and dropbear unlock (verified on 1984 on 2026-04-19, not re-run here).
* `harden.yml` end to end: UFW enable, sysctl (`net.netfilter.nf_conntrack_max`
  needs the `nf_conntrack` module loaded; the firewall role runs first and
  normally loads it), fail2ban, userns-remap Docker restart.
* Real ACME issuance and the ISRG chain check above; Let's Encrypt rate limits if DNS is wrong.
* The `deploy.yml` role sequence against real Docker (compose files were rendered and
  `docker compose config`-validated; the Caddyfile was validated and the updates
  vhost was served and probed in a local Caddy container).
* Any provider-specific quirk (1984 support turnaround for the ISO; static-IP details).

## What was validated without a server (2026-09-25)

* `ansible-playbook --syntax-check` on all 19 playbooks + `setup.yml`; `ansible-lint --profile min .` (the CI bar) passes.
* Every role referenced by `deploy.yml`, `harden.yml`, `setup.yml` exists.
* `scripts/check-required-env.py`: both `.env` templates render every var the worker requires.
* Preflight run end to end against a local target with the production layering
  (tracked `vars.yml` + `-e @vars-production…`): passes with valid input; fails with
  the intended message for a placeholder CIDR and for a DNS mismatch.
* Debian 13 rehearsal in a `debian:trixie` container: found and fixed the Docker
  apt repository (was hard-coded to Ubuntu), `software-properties-common` (absent
  from Debian 13), and unattended-upgrades origin patterns (matched nothing on Debian);
  the SSH hardening drop-in passes `sshd -t` on OpenSSH 10.0.
* The app's rendered `.env` now carries `NTFY_PUBLIC_URL=https://<ntfy_domain>`. Without it
  `apps/worker/lib/ntfy-origin.ts` rejects every Android device endpoint (only `NTFY_URL`
  = the internal `http://ntfy:80` was trusted), so Android devices could never be rung.
* `tofu validate` on `deploy/opentofu` (was failing; fixed).
* The app image builds (`--target app`) and contains `bun`.
