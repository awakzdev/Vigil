#!/bin/bash
set -euo pipefail

DOMAIN="vigil.cclab.cloud-castles.com"
API_DOMAIN="api.vigil.cclab.cloud-castles.com"
EMAIL="elazar@cloud-castles.com"
REPO_DIR="$(dirname "$(realpath "$0")")/.."
COMPOSE_FILE="$REPO_DIR/compose.yml"

echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh

echo "Installing certbot..."
apt-get update -qq
apt-get install -y -qq certbot

echo "Obtaining certificate for $DOMAIN and $API_DOMAIN..."
certbot certonly --standalone \
  -d "$DOMAIN" \
  -d "$API_DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

echo "Installing renewal cron job..."
CRON_JOB="0 3 * * * certbot renew --quiet --pre-hook \"docker compose -f $COMPOSE_FILE stop nginx\" --post-hook \"docker compose -f $COMPOSE_FILE start nginx\""
(crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$CRON_JOB") | crontab -

echo "Starting Vigil..."
docker compose -f "$COMPOSE_FILE" --env-file "$REPO_DIR/.env.prod" --profile prod up
