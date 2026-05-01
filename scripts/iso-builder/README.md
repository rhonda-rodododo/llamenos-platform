# ISO Builder Internals

These files are invoked by `scripts/build-iso.sh` (the operator entrypoint)
inside a pinned Debian 13 Docker container. Operators should NOT run these
files directly.

| File | Purpose |
|------|---------|
| `Dockerfile` | Pinned Debian 13 builder image with xorriso, gpg, debian-keyring, etc. |
| `build-inside.sh` | Container entrypoint: GPG-verify upstream ISO, render preseed, stage helpers, repack |
| `preseed.cfg.template` | Debian preseed template with `${VAR}` placeholders |
| `late-command.sh` | Runs in installer chroot before reboot — stages SSH key, hardens sshd, calls dropbear-setup |
| `dropbear-setup.sh` | Runs in installer chroot — configures dropbear-initramfs for remote LUKS unlock |

See `docs/deployment/iso-install.md` for the operator guide and
`docs/superpowers/specs/2026-04-09-fde-iso-builder-design.md` for the design rationale.
