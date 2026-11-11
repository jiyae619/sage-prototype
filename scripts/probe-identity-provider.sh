#!/bin/bash
# Resolves B2 from strategy/purple-agent-integration-plan.md §2: the
# {identityProvider} path segment on the PAT -> N1 JWT exchange has no
# enum/example anywhere in the 1.6MB OpenAPI spec. This tries each candidate
# named in the plan against the real endpoint and reports which one (if any)
# returns a JWT instead of a 404/400.
#
# Needs B1 (tenant URL) already resolved, and a PAT you've already issued
# yourself via Account -> Access Tokens -> New Token in the Purple UI
# (shown once as "n1pat_..." — this script never generates or stores one).
#
# Usage:
#   bash scripts/probe-identity-provider.sh https://your-tenant.example n1pat_xxx
#
# Reads the PAT as an argument, not a chat message or a committed file —
# same handling as scripts/mcp-smoke.sh's token argument.
set -u
TENANT="${1:?usage: probe-identity-provider.sh <tenant-base-url> <n1pat-token>}"
PAT="${2:?usage: probe-identity-provider.sh <tenant-base-url> <n1pat-token>}"
TENANT="${TENANT%/}"

# Named in the plan as the candidates worth trying first. If none of these
# work, the real value has to come from Purple support/docs rather than
# further guessing — this list isn't exhaustive.
CANDIDATES=(uw entra azuread)

for provider in "${CANDIDATES[@]}"; do
  URL="$TENANT/api/internal/authorization/$provider/GenerateToken"
  echo "=== identityProvider: $provider ==="
  echo "POST $URL"
  CODE=$(curl -s -o /tmp/probe-idp-body.json -w "%{http_code}" -X POST "$URL" \
    -H 'Content-Type: application/json' \
    -d "{\"accessToken\":\"$PAT\"}")
  echo "HTTP $CODE"
  head -c 500 /tmp/probe-idp-body.json
  echo ""
  echo ""
done

rm -f /tmp/probe-idp-body.json
echo "Look for the candidate that returned 200 with something JWT-shaped"
echo "(three base64url segments) in the body, rather than 404/400/401."
