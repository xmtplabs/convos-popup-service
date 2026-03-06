#!/usr/bin/env bash
set -euo pipefail

# Load .env from project root
ENV_FILE="${1:-.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "No .env file found at $ENV_FILE" >&2
  echo "Usage: $0 [path/to/.env]" >&2
  exit 1
fi

POPUP_URL="${POPUP_SERVICE_URL:-http://localhost:3000}"
NAMESPACE="${TX_NAMESPACE:-x-twitter}"
DISPLAY_NAME="${TX_DISPLAY_NAME:-X (Twitter) Connector}"
BASE_URL="${TX_BASE_URL:-http://localhost:4100}"
VERIFICATION_ENDPOINT="${BASE_URL}/verify"
APP_ICON_URL="${TX_APP_ICON_URL:-${BASE_URL}/app-icon.jpg}"
CONTACT_EMAIL="${TX_CONTACT_EMAIL:-admin@example.com}"

echo "Registering namespace '${NAMESPACE}' with ${POPUP_URL}..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${POPUP_URL}/connect/register" \
  -H 'Content-Type: application/json' \
  -d "{
    \"namespace\": \"${NAMESPACE}\",
    \"displayName\": \"${DISPLAY_NAME}\",
    \"verificationEndpoint\": \"${VERIFICATION_ENDPOINT}\",
    \"appIconUrl\": \"${APP_ICON_URL}\",
    \"contactEmail\": \"${CONTACT_EMAIL}\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ] || [ "$HTTP_CODE" = "200" ]; then
  CLIENT_ID=$(echo "$BODY" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).clientId))")
  CLIENT_SECRET=$(echo "$BODY" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).clientSecret))")
  echo "Registered successfully!"
  echo ""
  echo "TX_CLIENT_ID=${CLIENT_ID}"
  echo "TX_CLIENT_SECRET=${CLIENT_SECRET}"
  echo ""
  echo "Add these to Railway Dashboard > twitter-connector > Variables"
elif [ "$HTTP_CODE" = "409" ]; then
  echo "Namespace '${NAMESPACE}' is already registered."
  echo "If you lost the credentials, you'll need to delete and re-register the namespace."
  exit 1
else
  echo "Registration failed (HTTP ${HTTP_CODE}):"
  echo "$BODY"
  exit 1
fi
