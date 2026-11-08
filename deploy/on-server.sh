#!/usr/bin/env bash
set -euo pipefail
summ_dir="$HOME/summ"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo 'Install Docker Engine and Docker Compose first.' >&2
  exit 1
fi
if [ ! -d "$summ_dir/.git" ]; then
  git clone https://github.com/Rhadadi/Summ.git "$summ_dir"
else
  git -C "$summ_dir" pull --ff-only
fi
cd "$summ_dir"
if [ ! -f .env ]; then
  umask 077
  cp .env.example .env
  python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('.env')
p.write_text(p.read_text().replace('replace-with-a-long-random-token',secrets.token_urlsafe(36)))
PY
  echo 'Created a private .env. Set GEMINI_API_KEY and SUMM_MODEL to enable AI.'
fi
docker compose up -d --build
echo 'Summ started. Check: docker compose logs --tail=40'
echo 'Enter the app access token from your local .env into app Settings.'
