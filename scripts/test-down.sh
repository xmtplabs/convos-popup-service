#!/usr/bin/env bash
set -euo pipefail

echo "Stopping and removing services..."
docker compose down -v
echo "Done."
