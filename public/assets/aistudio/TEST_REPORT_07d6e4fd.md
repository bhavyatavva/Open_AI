# Release verification — Lessonly 2.0.0

Executed on 2026-11-22. This report records observed checks, not a claim that every possible behavior is verified.

Deployment-assistance update: added `tools/configure.py` and `tools/verify_deployment.py`. Their 12 tests passed, covering private file permissions, refusal to overwrite or follow symlinks, API-key rotation without database credential changes, domain validation, a readable synthetic PDF, and correct acceptance-report/cleanup behavior for success and AI failure. The acceptance runner tests use mocked HTTPS/HTTP responses; no public host is available yet, so they do not constitute a live deployment pass.

Local-launch update: added a separate PostgreSQL Compose stack and Windows/Mac/Linux launch instructions. Static configuration checks passed for loopback-only web exposure, no database host port, independent database volume, migration ordering, optional AI configuration, and `.env.local` exclusions. The Unix launch script passed `sh -n`. Windows launch scripts have CRLF line endings. These are configuration/syntax checks; neither Windows launcher execution nor Docker startup was possible in this Linux environment without Docker.

| Check | Observed result |
|---|---|
| Original backend suite on PostgreSQL 14.24 | **34 passed** |
| Expanded suite on SQLite, including deployment helpers | **45 passed, 1 skipped** (PostgreSQL worker-locking test) |
| Frontend API client tests | **4 passed** |
| TypeScript check and Vite production build | **Passed** |
| Backend coverage from SQLite run | **87%** overall; API routes **94%** |
| Python direct/indirect dependency audit | **No known vulnerabilities reported** by pip-audit |
| Frontend production dependency audit | **0 vulnerabilities** reported by npm audit |
| Compose YAML parsing | **Passed**; five services, database port not exposed |
| Browser login and project creation | **Passed** using a local QA account |
| Browser calibration and generation flow | **Passed with an explicitly labeled controlled AI fixture** |
| Browser editing, review, and reopening | **Passed**; educator edit and revision 3 remained saved |
| Desktop/mobile visual inspection | **Inspected** at 1440×1000 and 390×844; mobile document width did not exceed viewport |
| Browser JavaScript console | No errors/warnings in the inspected successful flow |
| Live OpenAI credential check | **Failed: HTTP 401** with the supplied key |
| Live paid model generation | **Not run** after credential rejection |
| Docker image build / Compose runtime | **Not run**: no Docker runtime/socket in this environment |
| Caddy HTTPS issuance and public domain | **Not run**: target host/domain not provided |

## Covered backend behavior

Tests cover unauthenticated access; registration validation/invitations; password hashing; opaque sessions; password change and session revocation; session expiry; origin and CSRF rejection; login throttling; private project isolation; source persistence; settings validation; generation queuing; duplicate-job rejection; project locking during generation; two-worker claim exclusion on PostgreSQL; partial-failure preservation; interrupted-job recovery; daily quotas; missing AI configuration; validated output/citation checks; malformed/refused/incomplete provider responses; artifact editing and conflict rejection; review status; generation-profile snapshots; Markdown, JSON, CSV and Anki serialization; project deletion cascades; real PDF text and page extraction; valid PDF upload; malformed, binary, blank and oversized sources; production configuration checks.

The real API request structure is tested through an HTTP transport double, including endpoint, structured JSON schema, source prompt, and `store:false`. Test doubles are confined to tests and the local verification harness; production generation has no fake-data fallback.

## Important limits

The Python coverage run does not instrument the isolated PDF subprocess, although real PDF extraction tests execute it. The operator password-reset command is implemented but was not exercised through an interactive production container. CSV/JSON/Markdown downloads are checked at the API level; a browser print-to-PDF dialog was not completed. Browser testing was a focused manual workflow rather than an exhaustive automated accessibility or cross-browser certification.

The included Compose configuration targets PostgreSQL 17; the local integration server available here was PostgreSQL 14.24. CI is configured to run against PostgreSQL 17 and build the Docker image, but no remote CI run occurred in this workspace.

During browser verification, the temporary local PostgreSQL process was stopped by the execution environment. The app displayed an error, then recovered on the next project read after the database restarted; previously saved edits remained intact. Production Compose supplies process restart policies, but that deployment behavior still requires the host acceptance check.

Before client signoff: run Docker Compose on the intended host, replace the invalid/exposed key, pass `tools/live_ai_smoke.py`, generate all required artifact types through HTTPS, review their educational quality with an educator, verify printed output, and restore a database backup into a separate test database.
