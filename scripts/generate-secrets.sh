#!/usr/bin/env bash
set -euo pipefail
echo "ACCESS_TOKEN_SECRET=$(openssl rand -base64 48)"
echo "INVITE_TOKEN_SECRET=$(openssl rand -base64 48)"
echo "APPROVAL_TOKEN_SECRET=$(openssl rand -base64 48)"
echo "ADMIN_TOKEN=$(openssl rand -base64 32)"
echo "XMTP_DB_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo ""
echo "Copy these into Railway Dashboard > popup-service > Variables"
