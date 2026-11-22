# Client handoff

**Product:** Lessonly Teaching Studio 2.0.0  
**Delivery:** Full application source, compiled frontend, automated tests, deployment files, sample course materials, and operations documentation.

## What the client receives

A private teaching workspace with educator accounts, document ingestion, nine educational artifact types, Bloom/difficulty calibration, persisted generation jobs, source-linked review, editing, saved project library, and portable exports. Real OpenAI requests execute on the server; API credentials are not exposed to the browser. PostgreSQL stores users, sessions, projects, artifacts, and job history.

## Files to read first

1. `README.md` — installation, launch, final acceptance, local development.
2. `TEST_REPORT.md` — verified behavior and outstanding deployment checks.
3. `OPERATIONS.md` — backups, recovery, upgrades, troubleshooting.
4. `ARCHITECTURE.md` — implementation structure and extension points.
5. `DEPLOY_FROM_ZERO.md` — first-time hosting setup and full public HTTPS/AI acceptance tests.
6. `LOCAL_START.txt` — extract the ZIP and launch locally with Docker Desktop, without a server or domain.

## Required deployment inputs

- A Linux Docker host and a domain directed to it.
- A valid OpenAI API project key and model access/billing.
- A new database password and workspace registration code.
- An operator responsible for backups, updates, and account recovery.

The previously supplied API key was rejected with HTTP 401 and is not included. Replace it in the deployment environment. Container launch, HTTPS certificates, and a live generation must pass before presenting the installation as accepted for production use.

## Suggested client acceptance walkthrough

Create an invited account → upload a text-bearing PDF → inspect extracted source passages → choose a difficulty and Bloom level → generate a lesson plan, quiz, flashcards and rubric → inspect answers/citations → edit and save → mark reviewed → sign out/in → reopen the saved project → export JSON/Markdown/CSV and print to PDF. Confirm that a second account cannot read the first account's project. Finish with a backup/restore rehearsal.

Software verification does not certify the factual or pedagogical quality of every AI output. The product is designed around educator review before classroom use.
