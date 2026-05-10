# Runbook

On-call playbook for `banking-devops-platform`. Each section follows the pattern: **symptom → first check → likely causes → remediation**. Commands assume you have `kubectl` configured against the cluster.

> Namespace: `banking-devops-platform`. Set it once: `export NS=banking-devops-platform`.

## Index

1. [API down](#1-api-down)
2. [Worker not processing jobs](#2-worker-not-processing-jobs)
3. [Redis connection failed](#3-redis-connection-failed)
4. [PostgreSQL connection failed](#4-postgresql-connection-failed)
5. [High error rate](#5-high-error-rate)
6. [Failed jobs increasing](#6-failed-jobs-increasing)
7. [Kubernetes pod CrashLoopBackOff](#7-kubernetes-pod-crashloopbackoff)
8. [Queue backlog increasing](#8-queue-backlog-increasing)
9. [Outbox dispatcher backed up](#9-outbox-dispatcher-backed-up) (v1.1)
10. [DLQ growing — ops decision needed](#10-dlq-growing) (v1.1)
11. [Canary rollout aborted](#11-canary-rollout-aborted) (v1.1)
12. [PgBouncer at connection limit](#12-pgbouncer-at-connection-limit) (v1.1)
13. [Frontend cannot connect to API](#13-frontend-cannot-connect-to-api) (v2.0)

---

## 1. API down

**Symptom:** External monitor reports `/health` failing, partner reports timeouts, `http_requests_total{status=~"5.."}` spike.

**First check:**

```bash
kubectl -n $NS get pods -l app=banking-api
kubectl -n $NS get endpoints banking-api
kubectl -n $NS describe deployment banking-api
```

**Likely causes:**

- All replicas failing readiness (probably DB or Redis is down — see sections 3 and 4).
- Recently rolled out a bad image.
- HPA scaled down to zero (shouldn't happen — `minReplicas: 2`).

**Remediation:**

```bash
# Get pod status & recent events
kubectl -n $NS describe pod -l app=banking-api | tail -50

# Tail logs
kubectl -n $NS logs -f deployment/banking-api --tail=200

# Roll back to previous revision
kubectl -n $NS rollout history deployment/banking-api
kubectl -n $NS rollout undo deployment/banking-api

# Force restart (re-pulls config/secrets)
kubectl -n $NS rollout restart deployment/banking-api

# Watch the rollout
kubectl -n $NS rollout status deployment/banking-api
```

If `/ready` is failing with `database: fail` or `redis: fail`, jump to section 3 or 4.

---

## 2. Worker not processing jobs

**Symptom:** Transactions stuck in `PENDING`, queue depth growing, `transaction_jobs_success_total` flat.

**First check:**

```bash
kubectl -n $NS get pods -l app=banking-worker
kubectl -n $NS logs -f deployment/banking-worker --tail=200

# Inspect the queue directly via Redis
kubectl -n $NS exec -it deployment/redis -- redis-cli LLEN bull:transaction-notification-queue:wait
kubectl -n $NS exec -it deployment/redis -- redis-cli LLEN bull:transaction-notification-queue:active
kubectl -n $NS exec -it deployment/redis -- redis-cli LLEN bull:transaction-notification-queue:delayed
```

**Likely causes:**

- Worker pod CrashLoopBackOff (jump to section 7).
- Worker pod is up but cannot connect to Redis (section 3) or DB (section 4).
- A poison-pill job is throwing on every attempt; check failed jobs.

**Remediation:**

```bash
# Restart the worker
kubectl -n $NS rollout restart deployment/banking-worker

# Scale up to clear backlog faster
kubectl -n $NS scale deployment/banking-worker --replicas=3

# Inspect failed jobs
kubectl -n $NS exec -it deployment/redis -- redis-cli ZRANGE bull:transaction-notification-queue:failed 0 5 WITHSCORES
```

After backlog clears, scale back down.

---

## 3. Redis connection failed

**Symptom:** `/ready` returns 503 with `redis: fail`; `redis_health_status` gauge is 0; worker logs `ECONNREFUSED 6379`.

**First check:**

```bash
kubectl -n $NS get pods -l app=redis
kubectl -n $NS logs deployment/redis --tail=100
kubectl -n $NS exec -it deployment/redis -- redis-cli ping
```

**Likely causes:**

- Redis pod evicted or crashed.
- Network policy blocking traffic.
- Wrong `REDIS_URL` in Secret.

**Remediation:**

```bash
# Check the current REDIS_URL the API sees (without revealing it)
kubectl -n $NS exec deployment/banking-api -- printenv | grep -E '^(REDIS_URL=)' | sed 's/=.*/=<redacted>/'

# Restart Redis
kubectl -n $NS rollout restart deployment/redis

# Re-apply secret if URL changed
kubectl apply -f k8s/02-secret.yaml
kubectl -n $NS rollout restart deployment/banking-api deployment/banking-worker
```

In production, replace the in-cluster Redis with a managed service.

---

## 4. PostgreSQL connection failed

**Symptom:** `/ready` returns 503 with `database: fail`; API logs contain `prisma error`; `database_health_status` is 0.

**First check:**

```bash
kubectl -n $NS get pods -l app=postgres
kubectl -n $NS describe pod -l app=postgres | tail -30
kubectl -n $NS logs deployment/postgres --tail=100
kubectl -n $NS exec -it deployment/postgres -- pg_isready -U banking -d banking
```

**Likely causes:**

- Pod evicted; PVC missing or read-only.
- Wrong credentials in Secret.
- Migrations in progress took an exclusive lock (rare in this project).
- Disk full on the node.

**Remediation:**

```bash
# Re-apply the manifests
kubectl apply -f k8s/10-postgres.yaml

# Inspect PVC
kubectl -n $NS get pvc
kubectl -n $NS describe pvc postgres-pvc

# If credentials changed
kubectl apply -f k8s/02-secret.yaml
kubectl -n $NS rollout restart deployment/banking-api deployment/banking-worker

# Manually verify schema
kubectl -n $NS exec -it deployment/postgres -- psql -U banking -d banking -c '\dt'
```

Production: this should be a managed Postgres (RDS, Cloud SQL). The in-cluster DB is for demo only.

---

## 5. High error rate

**Symptom:** `rate(http_requests_total{status=~"5.."}[5m])` spikes; alert from monitoring.

**First check:**

```bash
# Filter API logs for errors
kubectl -n $NS logs deployment/banking-api --tail=500 | grep -E '"level":"error"|"unhandled_error"'

# Check status code distribution
# (use your Prometheus / Grafana — example PromQL):
#   sum by (status) (rate(http_requests_total[5m]))
```

**Likely causes:**

- Validation failures from a misconfigured partner (400s look like errors but aren't a bug — check labels).
- Downstream dependency down (DB/Redis — see sections 3, 4).
- Bug in a recent deploy.

**Remediation:**

```bash
# If recent deploy is the suspect, roll back
kubectl -n $NS rollout undo deployment/banking-api

# If a single endpoint is failing, isolate via PromQL:
#   topk(5, sum by (route) (rate(http_requests_total{status=~"5.."}[5m])))

# If rate limiter is too aggressive, raise temporarily
kubectl -n $NS set env deployment/banking-api RATE_LIMIT_MAX=300
```

---

## 6. Failed jobs increasing

**Symptom:** `transaction_jobs_failed_total` rising; transactions in `FAILED` state.

**First check:**

```bash
kubectl -n $NS logs deployment/banking-worker --tail=500 | grep -E '"job_failed_terminal"|"job_attempt_failed"'

# Sample a failing transaction
kubectl -n $NS exec -it deployment/postgres -- psql -U banking -d banking -c \
  "SELECT transaction_id, processing_status, error_message FROM \"Transaction\" WHERE processing_status='FAILED' ORDER BY updated_at DESC LIMIT 10;"

# Inspect job logs for that transaction
kubectl -n $NS exec -it deployment/postgres -- psql -U banking -d banking -c \
  "SELECT * FROM \"JobLog\" WHERE transaction_id='TXN-...' ORDER BY created_at;"
```

**Likely causes:**

- Partner API down or slow → all retries exhaust.
- Partner returning a permanent error (4xx) — should not retry. Currently we retry everything; future improvement.
- Bug in worker that throws on every attempt.

**Remediation:**

- If partner is down: pause the worker (`kubectl scale deployment/banking-worker --replicas=0`) and resume after recovery; the queue will buffer.
- If it's a worker bug: roll back (`kubectl rollout undo deployment/banking-worker`).
- For now, manual requeue via Redis CLI; add an admin endpoint as a follow-up.

---

## 7. Kubernetes pod CrashLoopBackOff

**Symptom:** `kubectl get pods` shows `CrashLoopBackOff`.

**First check:**

```bash
kubectl -n $NS get pods
kubectl -n $NS describe pod <pod-name> | tail -50
kubectl -n $NS logs <pod-name> --previous --tail=200
```

**Likely causes:**

- Missing env var → Zod validation in `src/config/env.ts` exits the process at boot.
- Migration failure on API startup (Prisma can't connect).
- Image tag missing / pull error.
- Liveness probe too aggressive for cold start.

**Remediation:**

```bash
# Check events
kubectl -n $NS get events --sort-by=.lastTimestamp | tail -30

# Validate the Secret has expected keys
kubectl -n $NS get secret banking-secret -o jsonpath='{.data}' | jq 'keys'

# Re-apply config and secret
kubectl apply -f k8s/01-configmap.yaml
kubectl apply -f k8s/02-secret.yaml
kubectl -n $NS rollout restart deployment/banking-api deployment/banking-worker

# If image is wrong/missing
kubectl -n $NS set image deployment/banking-api api=banking-devops-platform:<known-good-tag>
```

---

## 8. Queue backlog increasing

**Symptom:** `wait` queue length grows; transactions remain `PENDING` for too long.

**First check:**

```bash
kubectl -n $NS exec -it deployment/redis -- redis-cli LLEN bull:transaction-notification-queue:wait
kubectl -n $NS exec -it deployment/redis -- redis-cli LLEN bull:transaction-notification-queue:active
kubectl -n $NS exec -it deployment/redis -- redis-cli LLEN bull:transaction-notification-queue:delayed
kubectl -n $NS get hpa -n $NS
```

**Likely causes:**

- Worker is too small (replicas / concurrency).
- Partner API is slow → each job takes longer.
- Worker pods crashing (section 7).

**Remediation:**

```bash
# Scale workers
kubectl -n $NS scale deployment/banking-worker --replicas=4

# Increase concurrency (requires deploy with new env)
# Edit src/workers/transaction.worker.ts: concurrency: 5 -> 20, then redeploy.

# Once backlog drains, scale back down
kubectl -n $NS scale deployment/banking-worker --replicas=1
```

A queue-depth-based HPA (using `keda` or custom metric adapter) is a recommended follow-up.

---

## 9. Outbox dispatcher backed up

**Symptom:** `outbox_pending_events` grows; `outbox_dispatch_lag_seconds` rising; transactions remain `PENDING` longer than ~2 seconds.

**First check:**

```bash
kubectl -n $NS logs -f deployment/banking-outbox --tail=200
kubectl -n $NS get pods -l app=banking-outbox

kubectl -n $NS exec -it deployment/postgres -- psql -U banking -d banking -c \
  'SELECT status, count(*) FROM "OutboxEvent" GROUP BY status;'
```

**Likely causes:**

- Outbox dispatcher pod crashed.
- Redis is unreachable (it can't enqueue; events stay PENDING).
- A bad event payload throws on every dispatch attempt — see `last_error` in the table.

**Remediation:**

```bash
# Scale up
kubectl -n $NS scale deployment/banking-outbox --replicas=2     # SKIP LOCKED handles concurrency

# Inspect last_error
kubectl -n $NS exec -it deployment/postgres -- psql -U banking -d banking -c \
  'SELECT id, aggregate_id, attempts, last_error FROM "OutboxEvent" WHERE status = '"'"'PENDING'"'"' AND last_error IS NOT NULL ORDER BY attempts DESC LIMIT 10;'

# Restart
kubectl -n $NS rollout restart deployment/banking-outbox
```

If a single poison event is blocking progress, manually mark it FAILED so the dispatcher skips it:

```sql
UPDATE "OutboxEvent" SET status = 'FAILED' WHERE id = <poison_id>;
```

---

## 10. DLQ growing

**Symptom:** `dlq_entries_total` increasing; admin inbox has `OPEN` entries.

**First check:**

```bash
ADMIN=$(kubectl -n $NS get secret banking-secret -o jsonpath='{.data.ADMIN_API_KEY}' | base64 -d)

kubectl -n $NS port-forward svc/banking-api 8080:80 &
curl -s -H "x-admin-api-key: $ADMIN" "http://localhost:8080/api/v1/admin/dlq?status=OPEN&limit=20" | jq

# Group failures by reason
kubectl -n $NS exec -it deployment/postgres -- psql -U banking -d banking -c \
  'SELECT reason, count(*) FROM "DlqEntry" WHERE status = '"'"'OPEN'"'"' GROUP BY reason ORDER BY count DESC;'
```

**Likely causes:**

- Partner API down or misconfigured — every transaction exhausts retries.
- A code bug throws on every attempt (look for the same stack repeating).
- Schema or data issue (e.g. a downstream column is now required and we're sending null).

**Remediation:**

```bash
# Once the underlying cause is fixed, requeue in batches
for ID in $(curl -s -H "x-admin-api-key: $ADMIN" "http://localhost:8080/api/v1/admin/dlq?status=OPEN&limit=50" | jq -r '.data.items[].transaction_id'); do
  curl -s -X POST -H "x-admin-api-key: $ADMIN" "http://localhost:8080/api/v1/admin/dlq/$ID/requeue"
done

# Or dismiss permanent failures
curl -s -X POST -H "x-admin-api-key: $ADMIN" "http://localhost:8080/api/v1/admin/dlq/<id>/dismiss"
```

Tag the postmortem with what changed (deploy SHA, partner change, schema change).

---

## 11. Canary rollout aborted

**Symptom:** Argo Rollouts shows `Degraded` / `Aborted`; analysis run failed.

**First check:**

```bash
kubectl argo rollouts -n $NS get rollout banking-api
kubectl argo rollouts -n $NS list rollouts -n $NS

# Inspect the analysis run
kubectl -n $NS get analysisrun
kubectl -n $NS describe analysisrun <name>
```

**Likely causes:**

- Success rate from `http_requests_total` dropped below the 98% threshold during a canary step.
- Prometheus address in the AnalysisTemplate is wrong / unreachable from the cluster.
- A real regression in the new image (the system is doing its job).

**Remediation:**

```bash
# Verify the issue is real (not a Prometheus access problem) — query directly
curl -s 'http://prometheus-server.monitoring.svc.cluster.local/api/v1/query?query=sum(rate(http_requests_total{app="banking-devops-platform",status!~"5.."}[1m]))/sum(rate(http_requests_total{app="banking-devops-platform"}[1m]))'

# If real regression: roll back
kubectl argo rollouts -n $NS undo banking-api

# If Prometheus issue: fix the AnalysisTemplate query/address, then retry
kubectl argo rollouts -n $NS retry rollout banking-api
```

---

## 12. PgBouncer at connection limit

**Symptom:** API logs show `client_login_timeout` or `no more connections allowed`; latency spikes; `pg_stat_activity` saturated.

**First check:**

```bash
kubectl -n $NS exec -it deployment/pgbouncer -- sh -c 'echo "SHOW POOLS; SHOW STATS;" | psql -h 127.0.0.1 -p 5432 -U pgbouncer pgbouncer' || true

kubectl -n $NS logs deployment/pgbouncer --tail=100
```

**Likely causes:**

- `MAX_CLIENT_CONN` or `DEFAULT_POOL_SIZE` too low for current load.
- A long-running query (or transaction) holding a server connection.
- Application-side connection leak (Prisma usually fine, but worth checking).

**Remediation:**

```bash
# Bump pool config (Helm)
helm upgrade banking helm/banking-devops-platform \
  --set pgbouncer.maxClientConn=400 \
  --set pgbouncer.defaultPoolSize=40

# Or directly on the Deployment
kubectl -n $NS set env deployment/pgbouncer MAX_CLIENT_CONN=400 DEFAULT_POOL_SIZE=40
kubectl -n $NS rollout restart deployment/pgbouncer

# Identify long queries on Postgres
kubectl -n $NS exec -it deployment/postgres -- psql -U banking -d banking -c \
  "SELECT pid, now()-query_start AS duration, state, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 10;"
```

If transaction-mode pooling is causing prepared-statement issues with Prisma, switch to session mode in `pgbouncer.poolMode` until the underlying issue is addressed.

---

## 13. Frontend cannot connect to API

**Symptom:** Dashboard pages show *"Network error contacting API at …"* or *"Failed to load …"* in red. The API itself is healthy (`curl /health` works from your laptop).

### Quick differential diagnosis

```bash
# 1) What URL does the browser actually use?
docker compose exec web sh -c 'echo $NEXT_PUBLIC_API_BASE_URL'
# In Kubernetes:
kubectl -n banking-devops-platform exec deployment/banking-web -- printenv NEXT_PUBLIC_API_BASE_URL
```

The value must be reachable **from the browser**, not from the web container. Three common shapes:

| Setup                 | Correct value                         |
| --------------------- | ------------------------------------- |
| `docker compose` on laptop | `http://localhost:3000`           |
| `kubectl port-forward` API to laptop | `http://localhost:3000` |
| Real cluster with Ingress | `https://api.banking.example.com` |

```bash
# 2) Is CORS allowing the dashboard origin?
docker compose exec api sh -c 'echo $CORS_ORIGINS'
# Should be `*` for local dev, or include the dashboard's exact origin in production:
#   CORS_ORIGINS=https://ops.banking.example.com
```

```bash
# 3) Can the browser actually reach the API? Open browser devtools → Network → look at the failing request.
#    - If it's CORS-blocked: the origin is missing from CORS_ORIGINS.
#    - If it's a 404: NEXT_PUBLIC_API_BASE_URL is wrong.
#    - If it's a connection refused: the API URL is unreachable from the browser.

# 4) Confirm by curling directly with the dashboard's Origin header:
curl -i -H "Origin: http://localhost:8080" http://localhost:3000/api/v1/system/status
# A correct response includes `Access-Control-Allow-Origin: ...` matching the Origin.
```

### Remediation

```bash
# Compose: rebuild web with the right URL baked in.
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 docker compose up -d --build web

# Kubernetes: roll the env var (and rebuild image if it was baked at build time).
kubectl -n banking-devops-platform set env deployment/banking-web NEXT_PUBLIC_API_BASE_URL=https://api.banking.example.com
kubectl -n banking-devops-platform rollout restart deployment/banking-web

# Update CORS to include the dashboard origin
kubectl -n banking-devops-platform set env deployment/banking-api CORS_ORIGINS=https://ops.banking.example.com
kubectl -n banking-devops-platform rollout restart deployment/banking-api
```

Note: `NEXT_PUBLIC_*` variables are baked into the browser bundle at build time. If you change the value after the image is built, you must rebuild the web image. For environments that change often, pass the value at build time with `--build-arg NEXT_PUBLIC_API_BASE_URL=...`.

If you see `Mixed Content` blocked in the browser console, the dashboard is HTTPS but the API URL is HTTP — fix by serving the API over HTTPS too.
