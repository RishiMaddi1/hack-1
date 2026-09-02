#!/usr/bin/env bash
# Azure App Service startup for Next.js standalone.
cd /home/site/wwwroot || cd "$(dirname "$0")"
exec node start.js
