# DNS Migration: Cloudflare to 1984 Hosting

## Purpose

Migrate DNS for `api.llamenos.org`, `updates.llamenos.org`, and `releases.llamenos.org` from Cloudflare to 1984 Hosting DNS.

## Prerequisites

- 1984 Hosting account with DNS management enabled
- Access to Cloudflare dashboard (current DNS)
- Access to domain registrar (for NS record changes)
- 1984 VPS already provisioned and accessible

## Steps

### Phase 1: Preparation (1 day before cutover)

#### 1. Lower TTLs on Cloudflare

In Cloudflare DNS dashboard, set TTL to 60 seconds for:
- `api.llamenos.org` A record
- `updates.llamenos.org` A record (if exists)
- `releases.llamenos.org` A record (if exists)

#### 2. Document current records

```bash
dig +short api.llamenos.org A
dig +short api.llamenos.org AAAA
# Record all values for rollback
```

#### 3. Create records in 1984 panel

Log into 1984 Hosting control panel > Domains > DNS Management:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | api | `<1984_VPS_IPv4>` | 300 |
| A | updates | `<1984_VPS_IPv4>` | 300 |
| A | releases | `<1984_VPS_IPv4>` | 300 |
| AAAA | api | `<1984_VPS_IPv6>` | 300 |
| AAAA | updates | `<1984_VPS_IPv6>` | 300 |
| AAAA | releases | `<1984_VPS_IPv6>` | 300 |

### Phase 2: Cutover

#### 4. Update NS records at registrar

Change nameservers from Cloudflare to 1984 Hosting nameservers. Find 1984's nameservers in their control panel.

#### 5. Verify propagation

```bash
# Check from multiple resolvers
for ns in 8.8.8.8 1.1.1.1 9.9.9.9; do
  echo "=== $ns ==="
  dig @$ns +short api.llamenos.org A
  dig @$ns +short updates.llamenos.org A
  dig @$ns +short releases.llamenos.org A
done

# Full trace
dig +trace api.llamenos.org
```

#### 6. Run Ansible preflight DNS validation

```bash
./deploy/scripts/deploy-official.sh --tags preflight
```

Expected: all DNS assertions pass.

### Phase 3: Stabilization

#### 7. Raise TTLs

After 24h of stable operation, update TTLs to 3600 in 1984 panel.

#### 8. Retire FLOKInet

After 48h monitoring:
- Verify no traffic reaches FLOKInet server
- Decommission FLOKInet VPS
- Remove FLOKInet from any remaining configuration

## Rollback

If issues arise during cutover:

1. Revert NS records at registrar to Cloudflare nameservers
2. Cloudflare records are still present (not deleted) — traffic resumes within TTL
3. Investigate and retry migration

## Verification

```bash
# All three domains resolve to 1984 VPS IP
curl -s https://api.llamenos.org/api/health/ready
curl -s https://updates.llamenos.org/health
curl -s https://releases.llamenos.org/desktop/latest.json | jq .version
```
