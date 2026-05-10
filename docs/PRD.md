# Product Requirements Document (PRD)

## Project: banking-devops-platform

**Document Version:** 2.0
**Last Updated:** 2026-05-10
**Owner:** DevOps / Platform Engineering Team

---

## 1. Project Overview

`banking-devops-platform` is a **full-stack** production-style backend service plus an operations dashboard that simulates how a bank receives, validates, persists, and asynchronously processes transaction notifications from a banking partner.

The project is purpose-built as a real-world DevOps/SRE portfolio piece. It demonstrates end-to-end skills in:

- Backend API design (Node.js + Express + TypeScript)
- Reliable persistence (PostgreSQL + Prisma) with PgBouncer pooling
- Asynchronous job processing with retries (Redis + BullMQ) and DLQ
- Outbox pattern for transactional event publishing
- Observability (structured JSON logs + Prometheus metrics + OpenTelemetry traces + health probes)
- Containerization (multi-stage Docker, non-root user)
- Orchestration (Kubernetes manifests + Helm chart + Argo Rollouts canary)
- GitOps (ArgoCD `Application`)
- CI/CD (GitHub Actions: lint, build, test, image scan, manifest validation, k6 smoke)
- Operations (runbook, incident response, deployment guide)
- **A Next.js operations dashboard** that turns the platform into a real demo: transactions, queue state, system health, ad-hoc notification submission

This is **not** a real bank, and the dashboard is **not** a customer banking UI. It is an operator-facing console for DevOps/SRE visibility.

---

## 2. Problem Statement

When a banking partner sends a transaction notification, the receiving system must:

1. Acknowledge quickly so the partner does not retry or time out.
2. Persist the notification durably before responding (no acknowledged-then-lost messages).
3. Process the transaction asynchronously, since downstream calls are slow and can transiently fail.
4. Retry failed downstream calls with backoff and surface terminal failures to operators.
5. Stay observable so on-call engineers can debug latency, error spikes, queue backlogs, and stuck jobs.
6. Expose its operational state to humans in a way that is faster than `kubectl` and PromQL: a dashboard that shows what the platform is doing right now.

A naive implementation couples the partner-facing API to slow downstream calls, has no operator visibility, and leaves on-call to grep logs. This project shows the correct decoupled pattern with a thin, useful dashboard on top.

---

## 3. Target Users

| User            | Need                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Banking partner | Submit transaction notifications via HTTP and receive a fast, reliable acknowledgement.                   |
| DevOps / SRE    | See queue state, transaction state, dependency health, retry attempts, and partner responses at a glance. |
| On-call engineer| Triage incidents from the dashboard + runbook, then dive into logs/metrics with confidence.                |
| Hiring manager  | Clone the repo, run `docker compose up`, open the dashboard, and evaluate the candidate end-to-end.       |

---

## 4. Goals

1. Fast, reliable HTTP API for partner notifications (sub-200ms p95 acknowledge under nominal load).
2. Persist + enqueue atomically via the **outbox pattern** so accepted notifications are never lost.
3. Process notifications asynchronously via BullMQ with bounded retries and a DLQ.
4. Expose `/health`, `/ready`, `/metrics` plus dashboard endpoints (`/transactions`, `/jobs/summary`, `/system/status`).
5. Ship a **Next.js operations dashboard** with five pages: Dashboard, Transactions list, Transaction detail, Notify, System.
6. Provide a multi-stage Dockerfile per app, a Compose file that brings up the whole stack, Kubernetes manifests, and a Helm chart.
7. Provide a GitHub Actions workflow that lints/builds/tests both apps, builds both images, scans them, validates manifests, runs a k6 smoke test, and conditionally publishes images.
8. Provide professional documentation: PRD, README, architecture, runbook, incident-response, deployment guide.

---

## 5. Non-Goals

- Real bank integration, real money movement, real KYC/AML, or real settlement.
- A customer-facing banking UI (this is an operator dashboard).
- Multi-tenant isolation, multi-region failover, zero-downtime schema migrations.
- Production-grade secret management (Vault, External Secrets Operator). Inline `Secret` is for portfolio convenience only.
- Authentication on the dashboard (in production this would sit behind SSO / Cloudflare Access).
- Real-time WebSocket updates on the dashboard. A refresh button + auto-poll is sufficient.

---

## 6. Functional Requirements

### FR-1 Receive transaction notification

`POST /api/v1/transactions/notify` accepts a JSON payload:

```json
{
  "transaction_id": "TXN-2026-0001",
  "account_id": "ACC-001",
  "amount": 100.50,
  "currency": "USD",
  "status": "SUCCESS",
  "description": "Payment received"
}
```

Behavior:

- Validate the payload (Zod).
- Verify the partner JWT (HS256) when `JWT_AUTH_ENABLED=true`.
- Reject duplicate `transaction_id` with HTTP 409.
- In a single Prisma transaction: persist a `Transaction` row (`PENDING`) **and** an `OutboxEvent` row.
- Return `202 Accepted` immediately.
- The outbox dispatcher (separate process) reads the event and enqueues a BullMQ job.

### FR-2 List transactions

`GET /api/v1/transactions?limit=20&offset=0&processing_status=FAILED&q=TXN-`

- Paginated (default `limit=20`, max `100`).
- Optional filter by `processing_status`.
- Optional `q` substring search on `transaction_id` or `account_id`.
- Returns `{ data: { count, total, items: [...] } }`.

### FR-3 Get transaction detail

`GET /api/v1/transactions/:transaction_id`

- Returns the transaction, processing status, partner response, error message, and **embedded job logs** (newest first).

### FR-4 Job summary

`GET /api/v1/jobs/summary`

- Returns counts per `processing_status` plus DLQ open count and outbox pending count.

```json
{
  "data": {
    "transactions": {
      "PENDING": 3, "PROCESSING": 1, "SUCCESS": 240, "FAILED": 2, "RETRY": 0
    },
    "dlq_open": 2,
    "outbox_pending": 0
  }
}
```

### FR-5 System status

`GET /api/v1/system/status`

- Returns:

```json
{
  "data": {
    "api":      { "status": "ok",  "uptime_seconds": 1234 },
    "database": { "status": "ok"  },
    "redis":    { "status": "ok"  },
    "queue":    { "wait": 1, "active": 0, "delayed": 0, "failed": 0 }
  }
}
```

### FR-6 Health & readiness

- `GET /health` — process is alive.
- `GET /ready` — DB + Redis reachable.

### FR-7 Metrics

- `GET /metrics` — Prometheus-compatible.

### FR-8 Worker processes jobs

A separate worker process consumes `transaction-notification-queue` and:

1. Updates the transaction to `PROCESSING`.
2. Simulates the partner API call.
3. On success: `SUCCESS` + partner response + `JobLog`.
4. On failure: `JobLog(RETRY)`, BullMQ exponential backoff.
5. After max retries: `FAILED` + error message + `DlqEntry(OPEN)` + push to DLQ stream.

### FR-9 DLQ admin endpoints

Protected by `x-admin-api-key`:

- `GET /api/v1/admin/dlq?status=OPEN&limit=50`
- `POST /api/v1/admin/dlq/:transaction_id/requeue`
- `POST /api/v1/admin/dlq/:transaction_id/dismiss`

### FR-10 Frontend dashboard

The Next.js app at `apps/web/` provides five operator-facing pages:

| Path                                    | Purpose                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| `/`                                     | Dashboard: totals + dependency health + queue summary           |
| `/transactions`                         | List view with search + status filter + refresh                 |
| `/transactions/[transaction_id]`        | Detail view with partner response, error, JobLog timeline       |
| `/notify`                               | Submit a notification ad-hoc (calls `POST /transactions/notify`)|
| `/system`                               | Health, readiness, queue summary, link to `/metrics`            |

Frontend rules:

- Loading / error / empty states on every page.
- Backend URL via `NEXT_PUBLIC_API_BASE_URL` only (no hardcoding).
- Backend internal errors are not surfaced verbatim — show a clean message + a copyable `request_id`.
- No customer-banking flows. This is operator visibility.

---

## 7. Non-Functional Requirements

| ID    | Requirement                                                                              |
| ----- | ---------------------------------------------------------------------------------------- |
| NFR-1 | API p95 acknowledge < 200ms under 100 RPS on a developer laptop.                         |
| NFR-2 | Zero data loss for accepted notifications (outbox pattern).                              |
| NFR-3 | Worker retries: 3 attempts, exponential backoff starting at 5000ms; DLQ on exhaustion.   |
| NFR-4 | Structured JSON logs only; no `console.log` of secrets or full payloads with PII.        |
| NFR-5 | All containers run as non-root.                                                          |
| NFR-6 | Liveness and readiness probes return within 2 seconds.                                   |
| NFR-7 | Frontend pages render with usable shell in <100ms (server-rendered shell, client fetch). |
| NFR-8 | Dashboard auto-refreshes (or has a clear refresh button) on at least the dashboard page. |
| NFR-9 | Kubernetes pods declare CPU/memory `requests` and `limits` for both apps.                |

---

## 8. Full-stack Architecture

```text
┌─────────────┐                   ┌──────────────────┐
│   Browser   │ ───── HTTPS ───►  │  Next.js Web     │
│ (operator)  │                   │  apps/web/       │
└─────────────┘                   └────────┬─────────┘
                                           │  fetch (NEXT_PUBLIC_API_BASE_URL)
                                           ▼
┌──────────────────────────┐     ┌──────────────────┐    ┌──────────────────┐
│   Banking Partner ───POST│ ──► │  API (Express)   │ ─► │   PostgreSQL     │
│                          │     │  apps/api/       │    │   + PgBouncer    │
└──────────────────────────┘     └────────┬─────────┘    └──────────────────┘
                                          │ enqueue via Outbox dispatcher
                                          ▼
                                 ┌──────────────────┐    ┌──────────────────┐
                                 │   Redis (BullMQ) │ ◄─ │   Worker         │
                                 └──────────────────┘    └──────────────────┘
```

- **apps/web** is a thin client. It does not embed business logic.
- **apps/api** owns validation, persistence, queueing, DLQ.
- **worker** and **outbox dispatcher** share the api image; different `command:`.

---

## 9. Backend API Requirements

| Endpoint                                              | Method | Auth          | Purpose                           |
| ----------------------------------------------------- | ------ | ------------- | --------------------------------- |
| `/api/v1/transactions/notify`                         | POST   | partner JWT*  | Accept partner notification.      |
| `/api/v1/transactions`                                | GET    | none          | Paginated list + filter + search. |
| `/api/v1/transactions/:transaction_id`                | GET    | none          | Detail + embedded job logs.       |
| `/api/v1/jobs/summary`                                | GET    | none          | Counts per status + DLQ + outbox. |
| `/api/v1/system/status`                               | GET    | none          | API/DB/Redis/queue snapshot.      |
| `/api/v1/admin/dlq`                                   | GET    | admin API key | DLQ list.                         |
| `/api/v1/admin/dlq/:transaction_id/requeue`           | POST   | admin API key | Requeue a failed transaction.     |
| `/api/v1/admin/dlq/:transaction_id/dismiss`           | POST   | admin API key | Close a DLQ entry.                |
| `/health`                                             | GET    | none          | Liveness probe.                   |
| `/ready`                                              | GET    | none          | Readiness probe.                  |
| `/metrics`                                            | GET    | none          | Prometheus scrape.                |

\* JWT enforcement is gated by `JWT_AUTH_ENABLED`; off by default for local development.

Conventions: `{ status: 1, message, data }` on success; `{ status: 0, message, errors? }` on failure.

---

## 10. Frontend Dashboard Requirements

Pages described in FR-10. UI rules:

- One global stylesheet (CSS modules or a single `globals.css`). No design system bloat.
- Dashboard cards show: totals, processing-status distribution, dependency health (DB/Redis), queue counts, DLQ open count.
- Transaction list: table with columns `transaction_id`, `account_id`, `amount`, `currency`, `processing_status`, `created_at`, `updated_at`. Status pill colors: PENDING/PROCESSING gray, SUCCESS green, FAILED red, RETRY yellow.
- Transaction detail: top card with summary; second card with `partner_response` JSON; third card with the `JobLog` timeline.
- Notify form: client-side validation; on success, redirect to detail page.
- System page: same data as the dashboard but expanded; link to `/metrics`.

Dependencies (web): minimal — `next`, `react`, `react-dom`, `typescript`, `@types/*`. No CSS framework or state library.

---

## 11. Database Requirements

- PostgreSQL 16 via Prisma. Optional PgBouncer in front.
- Models: `Transaction`, `JobLog`, `OutboxEvent`, `DlqEntry`. Enums: `ProcessingStatus`, `OutboxStatus`, `DlqStatus`.
- All Prisma calls live in `apps/api/src/repositories/`.
- Migrations via `npm run prisma:migrate` (in `apps/api/`).

---

## 12. Queue / Worker Requirements

- Main queue: `transaction-notification-queue`. `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`.
- DLQ stream: `transaction-notification-dlq`. Single attempt; long-lived.
- Outbox dispatcher: separate process; polls every 1s; uses `SELECT FOR UPDATE SKIP LOCKED` for safe concurrent dispatch.
- All three processes share the API image, different commands.

---

## 13. Observability Requirements

### Logs

Structured JSON via `pino` with redaction. Each line carries `request_id`, `transaction_id`, `job_id`, `attempt`, `processing_status`, `duration_ms`, `error_message`.

### Metrics (Prometheus)

| Metric                                          | Type      | Labels                |
| ----------------------------------------------- | --------- | --------------------- |
| `http_requests_total`                           | counter   | method, route, status |
| `http_request_duration_seconds`                 | histogram | method, route, status |
| `transactions_created_total`                    | counter   | currency              |
| `transaction_jobs_success_total`                | counter   | (none)                |
| `transaction_jobs_failed_total`                 | counter   | reason                |
| `transaction_job_processing_duration_seconds`   | histogram | (none)                |
| `database_health_status`                        | gauge     | (none)                |
| `redis_health_status`                           | gauge     | (none)                |
| `outbox_events_dispatched_total`                | counter   | event_type            |
| `outbox_events_dispatch_failed_total`           | counter   | event_type            |
| `outbox_pending_events`                         | gauge     | (none)                |
| `outbox_dispatch_lag_seconds`                   | gauge     | (none)                |
| `dlq_entries_total`                             | counter   | (none)                |
| `dlq_requeued_total`                            | counter   | (none)                |

Plus default Node.js process metrics.

### Tracing

OpenTelemetry SDK initialized in API, worker, and outbox dispatcher when `OTEL_ENABLED=true`. OTLP HTTP exporter.

### Probes

- API: `/health` (liveness), `/ready` (readiness DB + Redis).
- Worker / outbox dispatcher: `/health` on a dedicated metrics port.
- Web: `/api/health` (Next.js) — returns 200 once the process is up.

---

## 14. Security Requirements

Backend:

- helmet, CORS allowlist (env-driven), `express.json({ limit: '100kb' })`, `express-rate-limit` on `/notify`, env validation.
- HS256 JWT on partner endpoint when enabled; static `x-admin-api-key` for `/admin/*`.
- Centralized error middleware; no stack traces in production responses.
- Pino redaction of `Authorization`, `cookie`, `x-api-key`, `*.password`, `*.token`, `*.secret`, `DATABASE_URL`, `REDIS_URL`.

Frontend:

- Only `NEXT_PUBLIC_*` env vars exposed to the browser.
- Never proxies user-uploaded data without server-side validation (the API does the validating).
- Surfaces a clean "Something went wrong" + `request_id` instead of raw API errors.

Containers:

- Non-root user (`node`).
- No secrets baked into images.

---

## 15. Docker Requirements

- Compose services: `api`, `worker`, `outbox`, `web`, `postgres`, `pgbouncer`, `redis`.
- API + worker + outbox use a single image (`apps/api/Dockerfile`); different `command:`.
- Web uses its own `apps/web/Dockerfile` (Next.js standalone output).
- Healthchecks gate startup ordering.
- All non-stateful services run as non-root.

---

## 16. Kubernetes Requirements

Under `k8s/`:

- `00-namespace.yaml`
- `01-configmap.yaml`
- `02-secret.example.yaml`
- `10-postgres.yaml`, `15-pgbouncer.yaml`, `20-redis.yaml`
- `30-api-deployment.yaml`, `31-api-service.yaml`, `32-api-ingress.yaml`
- `35-api-rollout.yaml` (Argo Rollouts canary)
- `40-worker-deployment.yaml`, `41-outbox-deployment.yaml`
- `50-web-deployment.yaml`, `51-web-service.yaml`, `52-web-ingress.yaml`
- `60-hpa.yaml` (HPA for API + web)

Plus the Helm chart at `helm/banking-devops-platform/` and `argocd/application.yaml`.

Probes / resource requests + limits on every workload.

---

## 17. CI/CD Requirements

`.github/workflows/ci.yml`:

1. Checkout
2. Setup Node.js 20
3. Install root + apps/api + apps/web dependencies
4. Lint API + Web
5. TypeScript build for API + Web (`next build`)
6. Tests (placeholder script for now)
7. Build API Docker image (multi-stage, cached)
8. Build Web Docker image (multi-stage, cached)
9. Trivy filesystem + image scans (HIGH/CRITICAL)
10. `kubeconform` over `k8s/`
11. `helm lint` + `helm template` for default / dev / prod overlays
12. k6 smoke test against an ephemeral compose stack
13. Push images to registry **only if** `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` are set

---

## 18. Runbook Requirements

`docs/runbook.md` covers, with concrete `kubectl` and `docker compose` commands:

- API down
- **Frontend cannot connect to API** (CORS, env, network policy)
- Worker not processing jobs
- Redis connection failed
- PostgreSQL connection failed
- High error rate
- Failed jobs increasing
- Kubernetes pod CrashLoopBackOff
- Queue backlog increasing
- Outbox dispatcher backed up
- DLQ growing
- Canary rollout aborted
- PgBouncer at connection limit

`docs/incident-response.md` covers severity levels (SEV1/2/3/4), investigation checklist, rollback checklist, communication template, postmortem template.

---

## 19. Success Criteria

A reviewer can:

1. Clone the repo and run `docker compose up --build` on a clean machine.
2. Open `http://localhost:8080` and see the dashboard with live data.
3. Submit a notification from `/notify` and watch it move PENDING → PROCESSING → SUCCESS in `/transactions/:id`.
4. Open `/system` and see DB/Redis/queue health.
5. Hit `/health`, `/ready`, `/metrics` directly and see meaningful output.
6. Read `docs/runbook.md` and understand exactly how to triage each scenario.
7. Read `docs/architecture.md` and `README.md` and understand the system in under 10 minutes.
8. Run `kubectl apply -f k8s/` on a local cluster and see all pods (api, worker, outbox, web, postgres, pgbouncer, redis) become ready.

---

## 20. Out of Scope

- Customer-banking UI flows (this is an operator dashboard).
- Authentication on the dashboard (would sit behind SSO / Cloudflare Access in production).
- WebSocket-based live updates on the dashboard.
- Real settlement, ledger, accounting logic.
- Multi-region active-active.

---

## 21. Future Improvements

1. **mTLS** at the Ingress between partner and API (signed JWT is in place).
2. **Retry classification** — distinguish 4xx permanent vs 5xx transient partner errors.
3. **Auth on the dashboard** — wire to an OIDC provider or ship behind Cloudflare Access.
4. **WebSocket / SSE** on the dashboard for live queue + status updates.
5. **KEDA** queue-depth autoscaling for worker and outbox dispatcher.
6. **Frontend tests** with Playwright (smoke).
7. **Backend tests** — Jest + Supertest + testcontainers for Postgres + Redis.
8. **Schema migration safety** — pre-deploy migration job with zero-downtime patterns.
9. **Multi-region** with read replicas + a global queue.
10. **End-to-end OpenTelemetry** propagation from browser → API → worker, with a single trace ID per partner notification visible in the dashboard.
