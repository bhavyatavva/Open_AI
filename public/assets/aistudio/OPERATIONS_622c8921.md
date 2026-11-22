# Deployment and operations runbook

## Initial release acceptance

Configure a fresh API key, domain, database password, and invitation code. Launch Compose and confirm the migration exits successfully and web/db are healthy. Confirm the real AI smoke command passes, then test a sample generation through HTTPS. Verify the worker logs contain no recurring failures. Submit this release to the client with `TEST_REPORT.md`; do not describe the invalid-key check as a successful live AI test.

## Backups

Take regular backups to encrypted storage outside the host. Choose retention and access rules with the client. The example below uses a new, explicitly named backup file:

```sh
mkdir -p backups
docker compose exec -T db pg_dump -U lessonly -d lessonly -Fc > backups/lessonly-release-backup.dump
```

Record the release version alongside each backup. A backup is not verified until restored into a separate empty database and checked. Never copy a running PostgreSQL data directory as a logical backup.

## Restore into a fresh verification database

```sh
docker compose exec db createdb -U lessonly lessonly_restore_check
docker compose exec -T db pg_restore -U lessonly -d lessonly_restore_check < backups/lessonly-release-backup.dump
docker compose exec db psql -U lessonly -d lessonly_restore_check -c 'SELECT count(*) FROM users;'
```

For a real incident, stop web/worker, restore to a new database, change `DATABASE_URL` to that database in a reviewed Compose override, and restart after validation. Avoid overwriting the only surviving database. This package does not automatically schedule backups.

## Updating

Back up the database first. Review new schema migrations and release notes. Build the new image, stop web/worker, run `docker compose run --rm migrate`, and start web/worker again. Verify health, sign-in, one project read, and one generation. Keep the previous image and matching backup until signoff. Do not assume database migrations can be reversed by changing the image tag.

## Troubleshooting

| Symptom | Action |
|---|---|
| AI HTTP 401 | Replace the invalid/revoked API key in `.env`, then recreate web/worker. |
| AI HTTP 403/404 | Confirm project permissions and `OPENAI_MODEL` access. |
| AI HTTP 429 | Check provider rate limits and billing, then retry remaining artifacts. |
| Job stays queued | Confirm worker is running and points to the same database. |
| Interrupted running job | After five minutes, the worker marks it failed and preserves completed artifacts. |
| Sign-in works but mutations fail | Verify `APP_ORIGIN` exactly matches the browser HTTPS origin and Caddy is the only trusted proxy. |
| PDF has no text | Run OCR outside the app, then upload a text-bearing PDF or Markdown export. |
| Account password lost | Use the operator reset-password command after verifying ownership. |
| Certificates fail | Check DNS, inbound ports 80/443, and Caddy logs. |

Logs intentionally omit keys, passwords, source contents, and provider response bodies. Health checks verify database reachability; they do not assert model billing or worker progress. Monitor failed jobs, worker process restarts, disk utilization, database backups, and provider spend.

## Deployment boundary

This release supports a small, invitation-only workspace deployment. It does not implement SSO, MFA, email verification, student accounts, document collaboration, OCR, LMS synchronization, or a compliance certification. Those are separate product requirements. Registration uses a shared operator-issued invitation code; rotate it if disclosed. Container base tags receive upstream updates; record deployed image digests and review dependency updates in your release process.
