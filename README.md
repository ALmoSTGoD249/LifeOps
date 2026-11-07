# LifeOps
Our Dreams. Our life. Under control.

Self-hosted household service management. See ARCHITECTURE.md for design.

## Deploy
    cp .env.example .env      # fill in secrets
    docker compose up -d --build
    # open http://<server>:8080 (API docs at /api/docs); log in with ADMIN_EMAIL / ADMIN_PASSWORD
Migrations run automatically on backend start. Data lives in the named volumes `lifeops_pgdata` and `lifeops_uploads` and survives restarts and reboots (`restart: unless-stopped`).

## Access (home network + Tailscale)
Recommended: HTTPS everywhere via Tailscale, so the same URL works at home and away, cookies stay Secure, and phones can install the app to the home screen.

    # on the server, once (Tailscale installed and HTTPS enabled in the admin console)
    tailscale serve --bg 8080
    # then open the https://<server>.<tailnet>.ts.net URL from any device signed in to your tailnet
Use `tailscale serve`, not `tailscale funnel` (funnel would publish it to the internet). Keep BIND_ADDR=127.0.0.1 and COOKIE_SECURE=true.
LAN-only alternative: BIND_ADDR=0.0.0.0, COOKIE_SECURE=false, browse to http://<server-lan-ip>:8080 (traffic is unencrypted on your LAN).

## Development
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
    cd backend && pip install -r requirements-dev.txt && pytest
    cd frontend && npm install && npm run dev      # Vite on :5173, proxies /api to :8000
New migration: `cd backend && alembic revision --autogenerate -m "msg"` (set DATABASE_URL).

## Backup / restore
    ./scripts/backup.sh                       # DB dump + uploads archive into ./backups, keeps 14
    ./scripts/restore.sh backups/lifeops-<ts>.sql.gz
Add to cron for nightly backups and copy ./backups off the machine.

## Maintenance scheduler
A timer inside the backend (every 15 minutes, plus on startup and whenever a schedule is saved) creates tasks for maintenance schedules that are inside their lead window. It is idempotent, so restarts and repeated runs never create duplicates. "Check now" on the Maintenance page runs it on demand.

## Security notes
Knowledge Base protected details are encrypted at rest (Fernet) and never returned by list or detail endpoints. Revealing one is an explicit, CSRF-protected request that is written to the audit log. The key comes from ENCRYPTION_KEY, or SECRET_KEY if that is blank. Keep your .env backed up separately from database backups, and do not change the key.
Only Nginx is published. Postgres is not reachable from the host in production. Do not expose to the internet directly; use your VPN or an authenticated reverse proxy with TLS.
