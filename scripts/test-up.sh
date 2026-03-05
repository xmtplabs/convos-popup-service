#!/usr/bin/env bash
set -euo pipefail

echo "Building and starting services..."
docker compose up --build -d

echo "Waiting for services to be healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1 && \
     curl -sf http://localhost:4000/health > /dev/null 2>&1; then
    echo ""
    echo "All services are up!"
    echo "  Popup service:   http://localhost:3000"
    echo "  demo-popup-connector: http://localhost:4000"
    echo ""
    echo "Quick start:"
    echo "  1. curl -X POST http://localhost:4000/register"
    echo "  2. Check popup-service logs for approval URL"
    echo "  3. Open http://localhost:4000/demo to create a group"
    exit 0
  fi
  printf "."
  sleep 2
done

echo ""
echo "Timed out waiting for services. Check logs:"
echo "  docker compose logs"
exit 1
