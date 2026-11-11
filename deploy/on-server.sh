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
umask 077
if [ ! -f .env ]; then
  cp .env.example .env
  echo 'Created a private .env.'
fi
# Accounts need a secret for encrypting each user's Gemini key; add one to older .env files too.
if ! grep -q '^SUMM_SECRET_KEY=.\{32,\}' .env || grep -q '^SUMM_SECRET_KEY=replace-' .env; then
  python3 - <<'PY'
from pathlib import Path
import re,secrets
p=Path('.env');text=p.read_text()
line='SUMM_SECRET_KEY='+secrets.token_urlsafe(48)
text=re.sub(r'^SUMM_SECRET_KEY=.*$',line,text,flags=re.M) if re.search(r'^SUMM_SECRET_KEY=',text,re.M) else text.rstrip('\n')+'\n'+line+'\n'
p.write_text(text)
PY
  echo 'Generated SUMM_SECRET_KEY in .env.'
fi
grep -q '^SUMM_TRUST_PROXY=' .env || echo 'SUMM_TRUST_PROXY=true' >> .env
grep -q '^SUMM_OWNER_EMAIL=' .env || echo 'SUMM_OWNER_EMAIL=' >> .env
grep -q '^SUMM_OWNER_EMAIL=.\+' .env || echo 'Set SUMM_OWNER_EMAIL in .env to your Google account email, or nobody can publish.'
docker compose up -d --build
echo 'Summ started. Check: docker compose logs --tail=40'
echo 'Open the app, create an account, and add your own Gemini key under Account.'
