# Architecture and maintenance

```text
Browser: React + TypeScript
        │ HTTPS, same-origin API, opaque session cookie + CSRF header
        ▼
Caddy ──► Flask / Gunicorn ──► PostgreSQL
                │                   ▲
                └─ bounded PDF      │ durable queue / per-artifact commits
                   subprocess       │
                              Worker ──► OpenAI Responses API
```

## Code map

- `web/src/App.tsx`: authenticated views, project flow, source upload, calibration, editor, library, templates, settings, and print export.
- `web/src/components.tsx`: reusable dialog, status badge, empty state, and artifact rendering. React escapes all source/AI text. HTML is never injected.
- `web/src/api.ts`: same-origin requests, CSRF propagation, errors, and session expiry.
- `web/src/types.ts`: typed frontend models and supported artifact kinds.
- `server/app.py`: route validation, authorization, sessions, throttling, export serialization, and security headers.
- `server/models.py`: relational models and numbered schema migrations. PostgreSQL in production; SQLite for local development/tests.
- `server/extract.py`: file validation and isolated PDF extraction, producing stable source IDs and page references.
- `server/schema.py`: validated learning profiles and artifact schema shared by server validation and AI structured output requests.
- `server/ai.py`: real OpenAI integration. It does not return mock data when configuration fails.
- `server/worker.py`: database job claiming, interruption handling, and independent artifact persistence. PostgreSQL row locks support multiple workers.
- `server/manage.py`: schema migration and operator password recovery.

## Data lifecycle

An authenticated upload creates a project with extracted source passages. The educator saves a learning profile, then queues selected artifact types. The queue rejects concurrent generation for the same project. Worker requests are made per artifact, validated against the schema and project source IDs, and committed individually. A failed request leaves previous artifacts intact. Source text cannot be changed within an existing project; upload a new project for a new source.

Artifact edits use an expected revision number. Conflicting edits return HTTP 409. Content edits reset grounding labels and review status. Generating a new version adds another draft and preserves earlier artifacts. This is generation history, not full per-keystroke edit history. Export endpoints always read the latest saved database content.

## API outline

| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/register`, `/api/auth/login` | POST | Invitation-controlled registration and login |
| `/api/auth/logout`, `/api/auth/password` | POST | Logout or change password/revoke sessions |
| `/api/me` | GET | Account, CSRF token, AI configuration state |
| `/api/samples` | GET | Three included academic source texts |
| `/api/projects` | GET, POST | Private library and source ingestion |
| `/api/projects/{id}` | GET, PATCH, DELETE | Project, settings, latest job status, deletion |
| `/api/projects/{id}/generate` | POST | Queue selected types |
| `/api/projects/{id}/artifacts/{artifact}` | PATCH | Save edits / review status with revision check |
| `/api/projects/{id}/export/{format}` | GET | md, json, csv, anki |
| `/api/health` | GET | Database health |

All modifying browser requests require the configured Origin. Authenticated modifying requests additionally require `X-CSRF-Token`. Every project/artifact request checks account ownership. Production deployment assumes only Caddy can reach the web service.

## Extending the product

Add numbered migrations before changing deployed tables. Keep OpenAI secrets in the worker/server environment. Any new AI provider should return the same validated `ArtifactData` and map failures to safe error messages. Additional artifact kinds require schema/prompt, frontend labels, and semantic quality tests. Validate pedagogical quality with educators using representative materials and learner profiles; passing software tests is not a substitute for that evaluation.

The OpenAI request shape follows the official [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs), using the Responses API `text.format` JSON schema configuration, refusal handling, and incomplete-response checks.
