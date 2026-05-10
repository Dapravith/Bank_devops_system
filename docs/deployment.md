# Deployment Guide

How to run `banking-devops-platform` in three environments: local laptop, Docker Compose, and Kubernetes. This is a portfolio project; production-grade operations (managed DB, mTLS, GitOps) are listed at the bottom.

## 1. Prerequisites

| Tool           | Version | Why                          |
| -------------- | ------- | ---------------------------- |
| Node.js        | 20+     | Both apps                    |
| Docker         | 24+     | Compose & image build        |
| Docker Compose | v2      | Local stack                  |
| kubectl        | 1.28+   | Kubernetes deploy            |
| kind / minikube / Docker Desktop K8s | any | Local Kubernetes (optional) |

For Kubernetes you also need an Ingress controller (`ingress-nginx` works out of the box).

## 2. Local development

```bash
# 1. Install root + workspaces
npm install
npm run install:all

# 2. Bring up Postgres + Redis
docker compose up -d postgres redis

# 3. Setup env
cp .env.example .env

# 4. Migrate
npm run prisma:generate
npm run prisma:migrate:dev

# 5. Run each process (separate terminals)
npm run dev:api       # http://localhost:3000
npm run worker        # worker, /health on :3001
npm run outbox        # outbox dispatcher, /health on :3002
npm run dev:web       # http://localhost:8080
```

## 3. Docker Compose

Full stack — API, worker, Postgres, Redis — in one command:

```bash
docker compose up --build
```

The `api` service runs `prisma migrate deploy` on boot, so the schema is created automatically. Healthchecks gate `api` and `worker` so they wait for Postgres/Redis to be ready.

```bash
# Tail logs
docker compose logs -f api
docker compose logs -f worker

# Test
curl -s http://localhost:3000/health
curl -i -X POST http://localhost:3000/api/v1/transactions/notify \
  -H 'Content-Type: application/json' \
  -d '{"transaction_id":"TXN-1","account_id":"ACC-1","amount":10,"currency":"USD","status":"SUCCESS","description":"test"}'

# Tear down
docker compose down            # keep volumes
docker compose down -v         # delete data
```

## 4. Kubernetes deployment

### 4.1 Build and load the image

For a local cluster (kind shown; minikube/Docker Desktop are similar):

```bash
docker build -t banking-devops-platform:latest .
kind load docker-image banking-devops-platform:latest    # kind
# or:
# minikube image load banking-devops-platform:latest
# (Docker Desktop K8s shares the daemon, so no load needed)
```

### 4.2 Apply manifests

```bash
# 1. Namespace + non-secret config
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-configmap.yaml

# 2. Secret — copy the example, fill in values, apply
cp k8s/02-secret.example.yaml k8s/02-secret.yaml
# edit k8s/02-secret.yaml with real values, then:
kubectl apply -f k8s/02-secret.yaml

# 3. Stateful demo dependencies (replace with managed services in prod)
kubectl apply -f k8s/10-postgres.yaml
kubectl apply -f k8s/20-redis.yaml

# Wait for them
kubectl -n banking-devops-platform rollout status deployment/postgres
kubectl -n banking-devops-platform rollout status deployment/redis

# 4. App
kubectl apply -f k8s/30-api-deployment.yaml
kubectl apply -f k8s/31-api-service.yaml
kubectl apply -f k8s/32-api-ingress.yaml
kubectl apply -f k8s/40-worker-deployment.yaml
kubectl apply -f k8s/50-hpa.yaml

# 5. Verify
kubectl -n banking-devops-platform get pods
kubectl -n banking-devops-platform rollout status deployment/banking-api
kubectl -n banking-devops-platform rollout status deployment/banking-worker
```

Or apply everything at once:

```bash
kubectl apply -f k8s/
kubectl get pods -n banking-devops-platform -w
```

### 4.3 Verify end-to-end

```bash
# Port-forward
kubectl -n banking-devops-platform port-forward svc/banking-api 8080:80

# In another terminal
curl -s http://localhost:8080/health
curl -s http://localhost:8080/ready
curl -i -X POST http://localhost:8080/api/v1/transactions/notify \
  -H 'Content-Type: application/json' \
  -d '{"transaction_id":"TXN-K8S-1","account_id":"ACC-1","amount":42.50,"currency":"USD","status":"SUCCESS"}'
curl -s http://localhost:8080/api/v1/transactions/TXN-K8S-1
```

## 5. Rollback

```bash
# View revision history
kubectl -n banking-devops-platform rollout history deployment/banking-api

# Rollback to previous
kubectl -n banking-devops-platform rollout undo deployment/banking-api

# Rollback to a specific revision
kubectl -n banking-devops-platform rollout undo deployment/banking-api --to-revision=3

# Watch
kubectl -n banking-devops-platform rollout status deployment/banking-api
```

## 6. Updating

```bash
# Build new image
docker build -t banking-devops-platform:v1.0.1 .
kind load docker-image banking-devops-platform:v1.0.1

# Update deployments
kubectl -n banking-devops-platform set image deployment/banking-api  api=banking-devops-platform:v1.0.1
kubectl -n banking-devops-platform set image deployment/banking-worker worker=banking-devops-platform:v1.0.1

kubectl -n banking-devops-platform rollout status deployment/banking-api
kubectl -n banking-devops-platform rollout status deployment/banking-worker
```

## 7. Troubleshooting commands

```bash
# Pod status & events
kubectl -n banking-devops-platform get pods
kubectl -n banking-devops-platform describe pod <pod>
kubectl -n banking-devops-platform get events --sort-by=.lastTimestamp | tail -30

# Logs
kubectl -n banking-devops-platform logs -f deployment/banking-api
kubectl -n banking-devops-platform logs -f deployment/banking-worker

# Exec into containers
kubectl -n banking-devops-platform exec -it deployment/banking-api -- sh
kubectl -n banking-devops-platform exec -it deployment/postgres -- psql -U banking -d banking
kubectl -n banking-devops-platform exec -it deployment/redis -- redis-cli

# HPA status
kubectl -n banking-devops-platform get hpa
kubectl -n banking-devops-platform describe hpa banking-api

# Resource usage (requires metrics-server)
kubectl top pods -n banking-devops-platform
```

For specific incident scenarios (API down, queue backlog, CrashLoopBackOff), use [docs/runbook.md](runbook.md).

## 8. Helm chart deployment (v1.1+)

The Helm chart lives under `helm/banking-devops-platform/` and replaces the plain manifests with templated, value-driven resources.

```bash
# Default install
helm install banking helm/banking-devops-platform \
  -n banking-devops-platform --create-namespace

# Dev overlay (small, debug logs, single replica)
helm install banking helm/banking-devops-platform \
  -n banking-devops-platform --create-namespace \
  -f helm/banking-devops-platform/values-dev.yaml

# Prod overlay (managed deps, JWT + OTEL on, replicas up, TLS)
helm install banking helm/banking-devops-platform \
  -n banking-devops-platform --create-namespace \
  -f helm/banking-devops-platform/values-prod.yaml \
  --set secrets.databaseUrl="$DATABASE_URL" \
  --set secrets.redisUrl="$REDIS_URL" \
  --set secrets.partnerJwtSecret="$JWT_SECRET" \
  --set secrets.adminApiKey="$ADMIN_KEY"

# Upgrade to a new image
helm upgrade banking helm/banking-devops-platform --set image.tag=v1.2.0 ...

# Diff before applying
helm template banking helm/banking-devops-platform -f .../values-prod.yaml | diff - <(kubectl get all -n banking-devops-platform -o yaml) || true

# Render to file (e.g. for review or kubectl apply)
helm template banking helm/banking-devops-platform > /tmp/render.yaml
```

The chart toggles in-cluster Postgres / Redis / PgBouncer via `postgres.enabled`, `redis.enabled`, `pgbouncer.enabled`. Production overlays disable Postgres and Redis (use managed services) and enable PgBouncer.

## 9. GitOps with ArgoCD (v1.1+)

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Edit argocd/application.yaml to point at your fork's Git URL, then:
kubectl apply -f argocd/application.yaml

# CLI access
argocd login <server>
argocd app get banking-devops-platform
argocd app sync banking-devops-platform        # manual trigger
argocd app history banking-devops-platform     # rollback target
argocd app rollback banking-devops-platform <revision>
```

Auto-prune + self-heal are on by default — once the Application is reconciled, the cluster will continuously match Git.

## 10. Argo Rollouts canary (v1.1+)

```bash
# Install once per cluster
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f \
  https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# Replace the plain Deployment with the Rollout
kubectl -n banking-devops-platform delete deployment banking-api
kubectl apply -f k8s/35-api-rollout.yaml

# Drive a canary
kubectl argo rollouts -n banking-devops-platform set image banking-api api=banking-devops-platform:v1.2.0
kubectl argo rollouts -n banking-devops-platform get rollout banking-api --watch

# Promote / abort
kubectl argo rollouts -n banking-devops-platform promote banking-api
kubectl argo rollouts -n banking-devops-platform abort banking-api
```

The rollout pauses between steps (20/40/60/80) for analysis. The `AnalysisTemplate` queries Prometheus for non-5xx success rate and aborts the rollout if it falls below 98%.

## 11. PgBouncer (v1.1+)

In Compose: routed automatically as the `pgbouncer` service on port 6432 (host) / 5432 (cluster).

In Kubernetes: deployed by `k8s/15-pgbouncer.yaml` (or `pgbouncer.enabled=true` in Helm). Point `DATABASE_URL` at it:

```
postgresql://banking:banking@pgbouncer:5432/banking?schema=public
```

Pool mode is `transaction` for higher throughput. If your workload uses prepared statements heavily, switch `POOL_MODE` to `session`.

## 12. Production hardening (still open)

- **Managed Postgres** (RDS, Cloud SQL) — set `postgres.enabled=false` in Helm; point `DATABASE_URL` at the managed instance (via PgBouncer or pgproxy).
- **Managed Redis** (ElastiCache, MemoryStore) — set `redis.enabled=false`.
- **Real secrets** via External Secrets Operator / Vault / Sealed Secrets — replace the inline `Secret` template; the chart's `secret.yaml` is portfolio-only.
- **TLS** at the Ingress (cert-manager + Let's Encrypt). The `values-prod.yaml` has TLS annotations + tls block; provide a real cluster issuer.
- **mTLS** between partner and API — JWT is shipped; mTLS at the Ingress / mesh is the next layer.
- **Network policies** restricting east-west traffic.
- **Pod Disruption Budgets** so voluntary disruptions can't take all replicas at once.
- **Backup & PITR** for Postgres.
- **Queue-depth autoscaling** via KEDA for worker + outbox dispatcher.
