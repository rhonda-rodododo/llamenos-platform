# scripts/iso-builder/Dockerfile
# Pinned Debian 13 builder image used by scripts/build-iso.sh.
# All tool versions are pinned to support reproducible ISO output.

# Pinned base image. Update via:
#   docker pull debian:13.4-slim
#   docker inspect debian:13.4-slim --format '{{index .RepoDigests 0}}'
FROM debian:13.4-slim@sha256:4ffb3a1511099754cddc70eb1b12e50ffdb67619aa0ab6c13fcd800a78ef7c7a

# Reproducible-build env
ENV SOURCE_DATE_EPOCH=1735689600
ENV DEBIAN_FRONTEND=noninteractive
ENV LC_ALL=C
ENV TZ=UTC

# Install build tools.
# debian-keyring provides /usr/share/keyrings/debian-role-keys.gpg used by
# build-inside.sh to verify the upstream netinst ISO signature.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      debian-keyring \
      gnupg \
      wget \
      xorriso \
      isolinux \
      syslinux-utils \
      cpio \
      gzip \
      xz-utils \
      busybox-static \
      gettext-base \
      python3 \
    && rm -rf /var/lib/apt/lists/*

# Workspace
WORKDIR /work

# Copy in builder scripts. The host wrapper bind-mounts /out and /cache.
COPY build-inside.sh /usr/local/bin/build-inside.sh
COPY preseed.cfg.template /usr/local/share/llamenos-iso/preseed.cfg.template
COPY late-command.sh /usr/local/share/llamenos-iso/late-command.sh
COPY dropbear-setup.sh /usr/local/share/llamenos-iso/dropbear-setup.sh

RUN chmod +x /usr/local/bin/build-inside.sh

ENTRYPOINT ["/usr/local/bin/build-inside.sh"]
