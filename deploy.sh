#!/usr/bin/env bash
# Deploy FinanceWatcher to the Ugreen NAS DXP4800+.
# Run from the repo root (or the FinanceWatcher directory):
#   bash FinanceWatcher/deploy.sh
#
# Requires a .env file next to this script with at minimum:
#   ADMIN_EMAIL=...
#   ADMIN_PASSWORD=...
# Optionally:
#   GOCARDLESS_SECRET_ID=...
#   GOCARDLESS_SECRET_KEY=...
#   ANTHROPIC_API_KEY=...
#
# SSH key setup (one-time, avoids password prompts):
#   ssh-keygen -t ed25519 -f ~/.ssh/nas_id
#   ssh-copy-id -i ~/.ssh/nas_id Maxime@192.168.0.22

set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────────
NAS_HOST="192.168.0.22"
NAS_USER="Maxime"
NAS_SSH="$NAS_USER@$NAS_HOST"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/nas_id}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAS_SRC="/volume2/docker/FinanceWatcher"
NAS_DATA="/volume2/docker/finance"
NAS_STACK="/volume2/docker/stacks/finance.yml"

log() { echo "==> $*"; }

# ── Preflight ──────────────────────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $SCRIPT_DIR/.env not found."
  echo "  cp FinanceWatcher/.env.example FinanceWatcher/.env"
  echo "  # then fill in ADMIN_EMAIL, ADMIN_PASSWORD, API keys"
  exit 1
fi

# ── Encode files ───────────────────────────────────────────────────────────────
log "Encoding files..."
STACK_B64=$(base64 < "$SCRIPT_DIR/../stacks/finance.yml" | tr -d '\n')
ENV_B64=$(base64 < "$ENV_FILE" | tr -d '\n')

# ── Pack source (exclude build artefacts and dev files) ───────────────────────
log "Packing source..."
SRC_B64=$(
  tar -czf - \
    --exclude="./.next" \
    --exclude="./node_modules" \
    --exclude="./data" \
    --exclude="./.idea" \
    --exclude="./*.iml" \
    --exclude="./deploy.sh" \
    --exclude="./.env" \
    --exclude="./.env.local" \
    -C "$SCRIPT_DIR" . \
  | base64 | tr -d '\n'
)

# ── Single SSH session ─────────────────────────────────────────────────────────
log "Connecting to NAS..."

ssh -tt $SSH_OPTS "$NAS_SSH" bash -s << ENDSSH
stty -echo 2>/dev/null || true
set -euo pipefail

echo ""
echo "── [1/5] Directories ─────────────────────────────────────────────────────"
mkdir -pv "$NAS_SRC" "$NAS_DATA" /volume2/docker/stacks
echo "  [1/5] done"

echo ""
echo "── [2/5] Write compose + env ─────────────────────────────────────────────"
printf '%s' "$STACK_B64" | base64 -d > "$NAS_STACK"
printf '%s' "$ENV_B64"   | base64 -d > /volume2/docker/stacks/finance.env
echo "  Written $NAS_STACK"
echo "  Written /volume2/docker/stacks/finance.env"
echo "  [2/5] done"

echo ""
echo "── [3/5] Sync source files ───────────────────────────────────────────────"
printf '%s' "$SRC_B64" | base64 -d | tar -xzf - -C "$NAS_SRC"
echo "  Extracted to $NAS_SRC"
echo "  [3/5] done"

echo ""
echo "── [4/5] Build image ─────────────────────────────────────────────────────"
docker build -t finance-watcher:local "$NAS_SRC"
echo "  [4/5] done"

echo ""
echo "── [5/5] Restart container ───────────────────────────────────────────────"
docker compose -f "$NAS_STACK" --env-file /volume2/docker/stacks/finance.env up -d --force-recreate
echo "  Waiting 10s for container to settle..."
sleep 10
echo "  [5/5] done"

echo ""
echo "── Status ────────────────────────────────────────────────────────────────"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'NAME|finance' || true

echo ""
echo "── Health check ──────────────────────────────────────────────────────────"
for i in 1 2 3 4 5; do
  RESULT=\$(docker exec finance-watcher wget -qO- http://localhost:3000/finance/api/auth/status 2>&1 || echo "fail")
  echo "  Attempt \$i/5: \$RESULT"
  echo "\$RESULT" | grep -q "setupComplete" && break
  sleep 5
done

echo ""
echo "==> Deployment complete."
ENDSSH

log "Done. Open: https://fiddlestalenas.ddns.net/finance"
