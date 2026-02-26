# Nostr Relay Operations Guide

This document covers the deployment, hardening, monitoring, and troubleshooting of the Nostr relay used by Llamenos for real-time event delivery.

**Related documents**:
- [E2EE Architecture](architecture/E2EE_ARCHITECTURE.md) — Overall zero-knowledge architecture
- [Protocol Specification](protocol/llamenos-protocol.md) — Cryptographic details of hub event encryption
- [Deployment Hardening](security/DEPLOYMENT_HARDENING.md) — Infrastructure security guidance
- [Operator Runbook](RUNBOOK.md) — Operational procedures and troubleshooting

---

## 1. Overview

The Nostr relay replaces the former WebSocket server for all real-time communication in Llamenos. It handles:

- **Call notifications**: Incoming call ring events broadcast to on-shift volunteers
- **Presence updates**: Volunteer availability status (hub-encrypted)
- **Message notifications**: New conversation activity alerts
- **Typing indicators**: Real-time typing status
- **Call state changes**: Answer, hangup, transfer events propagated to all clients

All event content is encrypted with the hub key before publishing. The relay sees only encrypted blobs and generic tags — it cannot distinguish event types or read content.

### Why Nostr Instead of WebSocket

| Concern | WebSocket (old) | Nostr Relay (new) |
|---------|----------------|-------------------|
| Server sees content | Yes — server relayed all events in plaintext | No — relay sees only encrypted events |
| Event-type visibility | Yes — server knew event types for routing | No — generic `["t", "llamenos:event"]` tag only |
| Protocol standard | Custom proprietary | NIP-01/NIP-42 open standard |
| Self-hosted option | Same server as app | Independent infrastructure (strfry) |
| CF deployment | Built into Worker | Nosflare DO service binding |

---

## 2. Architecture

### strfry (Self-Hosted)

[strfry](https://github.com/hoytech/strfry) is a high-performance Nostr relay written in C++ using LMDB for storage. It is the recommended relay for self-hosted deployments.

**Characteristics**:
- Single binary, minimal dependencies
- LMDB storage (crash-resistant, zero-copy reads)
- NIP-42 authentication support
- Write policy plugins (restrict who can publish)
- Ephemeral event forwarding (kind 20000-29999)
- Low memory footprint (~50MB for typical workloads)

### Nosflare (Cloudflare)

For Cloudflare Workers deployments, Nosflare runs as a Durable Object with a service binding. It provides the same NIP-01/NIP-42 interface as strfry but runs on Cloudflare's edge network.

**Characteristics**:
- No separate infrastructure to manage
- Automatically scaled by Cloudflare
- Same trust model as the rest of the CF deployment (see [Threat Model: Cloudflare Trust Boundary](security/THREAT_MODEL.md#cloudflare-trust-boundary-honest-assessment))
- Does NOT provide additional privacy vs. Cloudflare (only vs. DB-only subpoena)

---

## 3. Deployment

### Docker Compose

The Nostr relay (strfry) is a core service that starts automatically with `docker compose up -d`. The `SERVER_NOSTR_SECRET` env var is required in `.env` (see [Quickstart](QUICKSTART.md)).

The relay runs on port 7777 internally. Caddy proxies `/nostr` to the relay via WebSocket.

**Environment variables**:
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVER_NOSTR_SECRET` | Yes | — | 64-char hex; server derives its Nostr keypair from this |
| `NOSTR_RELAY_URL` | No | `ws://strfry:7777` | Internal relay URL (Docker network) |

### Kubernetes (StatefulSet)

The Helm chart includes a strfry StatefulSet:

```yaml
# values.yaml
nostr:
  enabled: true
  relayUrl: "ws://strfry:7777"
  image:
    repository: dockurr/strfry
    tag: "latest"
  persistence:
    size: 5Gi
```

Create the server secret:
```bash
kubectl create secret generic llamenos-nostr-secret \
  --from-literal=server-nostr-secret=$(openssl rand -hex 32)
```

The StatefulSet uses a PersistentVolumeClaim for the LMDB data directory.

### Cloudflare (Service Binding)

Nosflare is configured in `wrangler.jsonc` as a service binding:

```bash
# Set the server Nostr secret
wrangler secret put SERVER_NOSTR_SECRET
```

No separate deployment step — Nosflare is part of the Worker bundle.

---

## 4. Hardening

### NIP-42 Authentication

strfry supports NIP-42 (client authentication). When enabled:

1. Client connects to the relay
2. Relay sends an `AUTH` challenge
3. Client signs the challenge with its Nostr identity key
4. Relay verifies the signature before allowing publish/subscribe

This prevents anonymous clients from subscribing to hub events or injecting events.

### Write Policy

Configure strfry's write policy to restrict publishing:

- **Server pubkey**: Allowed to publish server-authoritative events (call:ring, call:answered)
- **Member pubkeys**: Allowed to publish client events (presence, typing)
- **All others**: Rejected

The server can optionally maintain an allowlist of member pubkeys and push updates to strfry's write policy.

### Rate Limiting

Configure per-connection rate limits in strfry:

- **Max events per second**: 50 (generous for real-time events)
- **Max subscriptions per connection**: 10
- **Max event size**: 64KB (sufficient for encrypted event content)
- **Max connections per IP**: 20

### Ephemeral Events

Llamenos uses kind 20001 (ephemeral) for all real-time events. strfry forwards these to active subscribers but **never persists them to disk**. This is a critical privacy feature:

- Relay compromise does not reveal historical real-time events
- LMDB database contains only persistent events (if any) and relay state
- Disk forensics on the relay server reveals no call history or presence data

### Generic Tags

All Llamenos events use a single generic tag: `["t", "llamenos:event"]`. The actual event type is encrypted inside the content. This prevents:

- Traffic analysis by event type (relay cannot distinguish `call:ring` from `typing`)
- Operational tempo inference (all events look identical to the relay)

---

## 5. Monitoring

### Health Check

```bash
# Docker Compose
curl http://localhost:7777

# Or from inside the Docker network
docker compose exec strfry curl -sf http://localhost:7777
```

A healthy relay returns JSON with relay information (name, supported NIPs, etc.).

### Key Metrics

| Metric | How to Observe | Alert Threshold |
|--------|---------------|-----------------|
| Relay reachable | HTTP GET to relay port | Any failure |
| Active connections | strfry logs (`connection count`) | > 500 (investigate) |
| Event throughput | strfry logs (`events/sec`) | > 1000/s sustained (unusual) |
| LMDB size | `du -sh /app/strfry-db/` | > 1GB (investigate persistent events) |
| Memory usage | `docker stats strfry` | > 256MB (investigate) |
| CPU usage | `docker stats strfry` | > 50% sustained (investigate) |

### Log Analysis

```bash
# View relay logs
docker compose logs strfry --tail 100

# Follow live
docker compose logs -f strfry

# Filter for errors
docker compose logs strfry | grep -i "error\|warn\|fail"
```

---

## 6. Backup

### Ephemeral-Only Deployments

If all events are kind 20001 (ephemeral), the relay database contains only relay state — no user data. Backup is recommended but not critical for data recovery.

### Persistent Events

If persistent events are used (e.g., kind 1 for shift updates), back up the LMDB data directory:

```bash
# Docker Compose
docker run --rm -v llamenos_nostr-data:/data -v /opt/llamenos/backups:/backup \
  alpine tar czf /backup/strfry-$(date +%Y%m%d).tar.gz -C /data .

# Kubernetes
kubectl exec strfry-0 -- tar czf - /app/strfry-db | gzip > strfry-backup.tar.gz
```

### Restore

```bash
# Stop the relay
docker compose stop strfry

# Restore LMDB data
docker run --rm -v llamenos_nostr-data:/data -v /opt/llamenos/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/strfry-20260225.tar.gz -C /data"

# Restart
docker compose start strfry
```

---

## 7. Troubleshooting

### Relay Unreachable

**Symptom**: Clients show "relay disconnected" or real-time events stop working.

1. Check if the relay container is running:
   ```bash
   docker compose ps strfry
   ```

2. Check the strfry container status:
   ```bash
   docker compose ps strfry
   ```

3. Check Caddy is proxying `/nostr`:
   ```bash
   curl -sI https://hotline.yourorg.org/nostr
   # Should return 426 Upgrade Required (not a proper WS handshake)
   ```

4. Check relay logs for errors:
   ```bash
   docker compose logs strfry --tail 50
   ```

### NIP-42 Auth Failures

**Symptom**: Clients connect but cannot subscribe or publish.

1. Verify the client is sending a valid NIP-42 auth event
2. Check if the client's pubkey is in the relay's allowlist
3. Verify the server pubkey matches what clients expect (derived from `SERVER_NOSTR_SECRET`)

### Event Delivery Delays

**Symptom**: Events take >1 second to reach subscribers.

1. Check relay CPU and memory usage — under load, strfry may queue events
2. Check network latency between the app server and relay (should be <10ms if co-located)
3. For Nosflare, check Cloudflare's edge latency to the client

### SERVER_NOSTR_SECRET Missing

**Symptom**: App fails to start with "SERVER_NOSTR_SECRET is required" or events are not signed.

```bash
# Generate and set the secret
SERVER_NOSTR_SECRET=$(openssl rand -hex 32)
echo "SERVER_NOSTR_SECRET=$SERVER_NOSTR_SECRET" >> .env
docker compose restart app
```

### Server Identity Changed

**Symptom**: After rotating `SERVER_NOSTR_SECRET`, clients reject server events.

This is expected — changing the secret changes the server's Nostr identity. Clients will see a new server pubkey after re-authenticating. All active clients must reconnect to accept events from the new server identity.
