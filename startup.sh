#!/usr/bin/env bash
# Azure App Service startup for Next.js standalone.
# Azure sets HOSTNAME to the container id; Next binds to that and returns 502/503.
# Force 0.0.0.0 so the reverse proxy can reach the app.
export HOSTNAME=0.0.0.0
export PORT="${PORT:-8080}"
cd /home/site/wwwroot || cd "$(dirname "$0")"
exec node server.js
