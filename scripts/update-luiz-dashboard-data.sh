#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="/root/.openclaw/workspaces/aquisicao-bruno/samuelteste"
exec 9>"$ROOT/.refresh-data.lock"
flock -n 9 || exit 0
N8N_C="$(docker ps --filter name=n8n_n8n --format '{{.Names}}' | head -1)"
HOST_CRED="/tmp/luiz-dashboard-notion-cred.$$.$RANDOM.json"
CONTAINER_CRED="/tmp/luiz-dashboard-notion-cred.$$.$RANDOM.json"

cleanup() {
  rm -f "$HOST_CRED"
  if [ -n "${N8N_C:-}" ]; then
    docker exec "$N8N_C" rm -f "$CONTAINER_CRED" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ "${USE_ENV_NOTION_TOKEN:-0}" != "1" ]; then
  if [ -z "$N8N_C" ]; then
    echo "n8n container nao encontrado" >&2
    exit 2
  fi

  docker exec "$N8N_C" n8n export:credentials \
    --id=Uce1knXgyTdEoTzn \
    --decrypted \
    --output="$CONTAINER_CRED" >/tmp/luiz-dashboard-n8n-credential.log 2>&1
  docker cp "$N8N_C:$CONTAINER_CRED" "$HOST_CRED" >/dev/null

  NOTION_TOKEN="$(
    node - "$HOST_CRED" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const item = Array.isArray(data) ? data[0] : data;
const token = item?.data?.apiKey;
if (!token) process.exit(2);
process.stdout.write(token);
NODE
  )"
  export NOTION_TOKEN
fi

cd "$ROOT"
node scripts/update-luiz-dashboard-data.mjs
if [ -d dist ]; then
  cp public/luiz-contatos.json dist/.luiz-contatos.json.tmp
  chmod 644 dist/.luiz-contatos.json.tmp
  mv dist/.luiz-contatos.json.tmp dist/luiz-contatos.json
fi
