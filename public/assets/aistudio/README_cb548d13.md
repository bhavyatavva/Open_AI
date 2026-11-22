# Lessonly Teaching Studio

A React/TypeScript application backed by Flask, PostgreSQL, a durable generation worker, and the OpenAI Responses API. Uploaded PDF/Markdown/TXT sources become editable learning kits. This package replaces the earlier static prototype.

## Release status

Implemented and tested: account registration/login/logout, Argon2 password hashing, database sessions, CSRF/origin validation, account isolation, PostgreSQL persistence, source extraction, durable generation jobs, nine artifact types, editing with revision conflicts, educator review status, source citations, Markdown/JSON/CSV/Anki exports, print layout, templates, library search/filtering, and content metrics.

The supplied API credential returned **HTTP 401** in the live OpenAI check. A valid replacement key is required before the live AI acceptance check can pass. No credential is included in this package. Docker is not available in the build environment, so the container build and full Compose launch remain deployment checks. See `TEST_REPORT.md` for precise verification evidence and limits.

## Open on your own computer

Extract the ZIP, install and start [Docker Desktop](https://docs.docker.com/desktop/), then open the extracted `lessonly` folder. On Windows, double-click **Start-Lessonly.cmd**. On Mac/Linux, run `sh start-local.sh` in that folder. The first launch downloads and builds dependencies.

Open **http://localhost:8080**, create an account, and leave the invitation code blank. No server or domain is needed. For real AI generation, put a valid API key in the `.env.local` file created by the launcher, then run the launcher again. You can browse the app and upload documents without a key. Windows users can stop the app with **Stop-Lessonly.cmd**; saved data remains in the local Docker database volume.

See `LOCAL_START.txt` for full steps, Mac/Linux stop commands, and troubleshooting. `compose.local.yaml` uses PostgreSQL and exposes only the web service on `127.0.0.1:8080`; it is for local use, with a separate database volume from the production Compose stack. Docker execution still requires verification on a computer with Docker installed.

## Deploy with Docker Compose

**No server yet?** Start with `DEPLOY_FROM_ZERO.md`, which includes hosting setup, private credential entry, and the end-to-end HTTPS/AI acceptance commands.

Requirements: a Linux host with Docker Engine and Compose v2, a domain pointing to the host, and inbound ports 80/443. Start with 2 CPUs and 4 GB RAM for a small workspace. Use the root of this package as the working directory.

1. On the deployment host, run `python3 tools/configure.py` for private interactive configuration. Alternatively, copy `.env.example` to `.env` and restrict it to the operator: `chmod 600 .env`.
2. Set `DOMAIN` to a real hostname (no protocol or path). Set a long hexadecimal `POSTGRES_PASSWORD`, a `REGISTRATION_CODE` of at least 20 characters, and a valid `OPENAI_API_KEY`. `openssl rand -hex 32` can generate each non-API secret. Never reuse the exposed chat credential.
3. Choose a model your API project can access. The default is `gpt-4.1-mini`; `OPENAI_MODEL` is configurable.
4. Validate and launch:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 web worker migrate proxy
```

Caddy obtains HTTPS certificates. PostgreSQL has a persistent named volume and is not exposed on a host port. The migration service runs before web and worker. The worker survives web restarts and saves each completed artifact independently.

5. Run the small live AI acceptance check (this makes a billable API request):

```sh
docker compose exec worker python tools/live_ai_smoke.py
```

6. Open `https://YOUR_DOMAIN`, create an educator account using the invitation code, choose a sample, generate a kit, edit and save a section, sign out/back in, and verify the exports. This is the final acceptance test before client signoff.

Registration is invitation-controlled rather than email-verified. Each account owns its own projects; cross-account collaboration is not implemented. Password recovery is an administrator operation, with no email delivery dependency:

```sh
docker compose exec -it web python -m server.manage reset-password --email educator@example.com
```

The command prompts for the password without echoing it and revokes existing sessions. Use only after confirming the account owner's identity.

## Local development

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
python -m server.manage migrate
cd web
npm ci
npm run build
cd ..
gunicorn --bind 127.0.0.1:8080 'server.app:create_app()'
```

In a second shell with the same environment, run `python -m server.worker`. Set `OPENAI_API_KEY` securely in that shell before starting the worker and web. Local mode uses SQLite and HTTP at `http://localhost:8080`; production mode requires PostgreSQL and HTTPS. Opening an HTML file directly is not supported.

For Vite development, run `npm run dev` in `web` and set `APP_ORIGIN=http://localhost:5173` for the backend. Vite proxies `/api` to port 8080. Do not set `APP_ENV=production` for this local flow.

## Test

```sh
pytest -q
# Against an expendable PostgreSQL test database only:
TEST_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost/lessonly_test pytest -q
cd web
npm ci
npm run build
npm test
npm audit --omit=dev
```

Tests delete their test database rows. Never point `TEST_DATABASE_URL` at a production database. `.github/workflows/ci.yml` runs the backend suite against PostgreSQL 17, builds the frontend, and builds the Docker image.

## Operations and data

- Sessions are opaque, hashed in the database, expire after 24 hours, and use HttpOnly/SameSite cookies (Secure in production).
- The web service trusts exactly one proxy hop. Keep it behind the included Caddy proxy; do not expose port 8080 publicly.
- PDF parsing runs in a separate process with CPU/memory/time limits. Maximum 25 MB, 100 PDF pages, and 100,000 extracted characters. Scanned or encrypted PDFs must be OCR-processed/unlocked before upload; no silent empty extraction.
- Raw uploaded binaries are discarded after extraction. Extracted passages and generated artifacts are stored in PostgreSQL. Protect database volumes/backups with host encryption and controlled access.
- The model receives source passages and the learning profile. API response storage is disabled with `store:false`; this does not by itself promise zero provider retention.
- Generation defaults to 20 jobs per account per day, with at most nine artifacts per job. Configure `DAILY_JOB_LIMIT` and API provider spending controls for your budget.
- Failed or interrupted jobs preserve completed artifacts. Retry only remaining types. Regeneration adds a new artifact draft; edits use revision checks to prevent overwrites.
- Grounding is a model judgment plus validated source IDs, not factual certification. Educators must review content before use. Editing invalidates grounding/review status until the educator reviews it again.
- Existing artifacts keep the profile used when they were generated, even if the project's current settings change later.
- The library supports up to 200 projects per account. Export and remove older projects when reaching that limit.

See `OPERATIONS.md` for backup, restore, updating, and troubleshooting. See `ARCHITECTURE.md` for service boundaries and extension points.
