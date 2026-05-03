#!/bin/bash
# strfry write-policy plugin: only accept events from the server pubkey.
#
# strfry invokes this as a long-running subprocess. For each incoming event it
# writes one JSON line to stdin; the plugin must respond with one JSON line on
# stdout containing { "id": "<event-id>", "action": "accept"|"reject"|"shadowReject", "msg": "..." }.
#
# Environment:
#   ALLOWED_PUBKEY — hex pubkey of the server (derived from SERVER_NOSTR_SECRET)
#
# NIP-42 auth events (kind 22242) are always accepted regardless of pubkey,
# because any connecting client must be able to authenticate.

if [ -z "$ALLOWED_PUBKEY" ]; then
  echo "FATAL: ALLOWED_PUBKEY not set" >&2
  exit 1
fi

while IFS= read -r line; do
  # Extract event fields using jq
  pubkey=$(echo "$line" | jq -r '.event.pubkey // empty')
  kind=$(echo "$line" | jq -r '.event.kind // 0')
  event_id=$(echo "$line" | jq -r '.event.id // empty')

  if [ -z "$event_id" ]; then
    # Malformed input — reject
    echo "{\"id\":\"\",\"action\":\"reject\",\"msg\":\"malformed event\"}"
    continue
  fi

  # Always allow NIP-42 auth events from any pubkey
  if [ "$kind" = "22242" ]; then
    echo "{\"id\":\"$event_id\",\"action\":\"accept\"}"
    continue
  fi

  # Only accept events from the whitelisted server pubkey
  if [ "$pubkey" = "$ALLOWED_PUBKEY" ]; then
    echo "{\"id\":\"$event_id\",\"action\":\"accept\"}"
  else
    echo "{\"id\":\"$event_id\",\"action\":\"reject\",\"msg\":\"unauthorized publisher\"}"
  fi
done
