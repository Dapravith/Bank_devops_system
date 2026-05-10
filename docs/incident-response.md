# Incident Response

How we respond to incidents in `banking-devops-platform`. Keep it short, keep it calm, write things down as you go.

## 1. Severity levels

| Sev   | Definition                                                                         | Response time | Comms cadence | Examples                                                          |
| ----- | ---------------------------------------------------------------------------------- | ------------- | ------------- | ----------------------------------------------------------------- |
| SEV1  | Full outage or money/data at risk. Customer-visible failure with no workaround.    | Immediate     | Every 15 min  | API totally down; transactions silently dropped; DB corruption.   |
| SEV2  | Partial outage or major degradation. Some users affected; system limping.          | Within 30 min | Every 30 min  | Worker not processing; >5% 5xx; queue backlog growing.            |
| SEV3  | Minor degradation. Internal/edge feature impaired; full workaround available.      | Within 4 h    | Daily         | Single endpoint slow; non-critical metric missing.                |
| SEV4  | No customer impact. Hygiene / cosmetic / pre-emptive.                              | Best effort   | None required | Log warning spam; misnamed metric; doc inaccuracy.                |

Promote severity if scope grows — never silently downgrade.

## 2. Incident roles

For SEV1/SEV2, name explicit roles. One person can hold two roles in a small team but never all three.

- **Incident Commander (IC):** Drives the response. Makes decisions. Owns comms cadence.
- **Operations Lead:** Executes commands, runs the runbook, mitigates.
- **Communications Lead:** Drafts and sends customer / stakeholder updates.

## 3. Investigation checklist

Run through this in order. Stop as soon as you have enough to mitigate; go back to investigate after.

- [ ] **Confirm scope.** Is this all users or one? All endpoints or one? `curl /health`, `curl /ready`.
- [ ] **Look at the last deploy.** `kubectl -n $NS rollout history deployment/banking-api` — was something shipped recently?
- [ ] **Check dependencies.** Postgres reachable? Redis reachable? Run [docs/runbook.md §3 and §4](runbook.md).
- [ ] **Check error budget.** PromQL: `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`.
- [ ] **Check queue depth.** See [docs/runbook.md §8](runbook.md).
- [ ] **Check resource pressure.** `kubectl top pods -n $NS`. CPU/memory at limits? OOMKilled?
- [ ] **Check recent config / secret changes.** `kubectl describe configmap`, `kubectl describe secret`.
- [ ] **Read the logs.** Filter for `"level":"error"`. Look for the first error, not the most recent.
- [ ] **Form a hypothesis.** Write it down before acting on it.

## 4. Mitigation choices

Pick the cheapest, most reversible one that's likely to work. In rough order of preference:

1. **Roll back the deploy.** `kubectl -n $NS rollout undo deployment/<name>`. Fastest if a recent deploy is suspect.
2. **Restart pods.** `kubectl -n $NS rollout restart deployment/<name>`. Cheap; clears transient state.
3. **Scale up.** `kubectl -n $NS scale deployment/banking-worker --replicas=N`. Useful for queue backlog.
4. **Disable a feature.** E.g. lower `RATE_LIMIT_MAX`, increase `JOB_BACKOFF_DELAY_MS`, set `PARTNER_API_FAILURE_RATE` to a benign value via ConfigMap.
5. **Pause the worker.** `kubectl -n $NS scale deployment/banking-worker --replicas=0`. Queue buffers; partner unaffected.
6. **Fix forward.** Only when rollback is genuinely impossible.

## 5. Rollback checklist

- [ ] Identify the last known-good revision: `kubectl -n $NS rollout history deployment/<name>`.
- [ ] Roll back: `kubectl -n $NS rollout undo deployment/<name>` (optionally `--to-revision=N`).
- [ ] Watch the rollout: `kubectl -n $NS rollout status deployment/<name>`.
- [ ] Verify with `/health`, `/ready`, and a representative API call.
- [ ] Check Prometheus to confirm error rate dropped.
- [ ] Update the incident channel: "Rolled back to revision N at HH:MM UTC. Error rate now X%."
- [ ] If a DB migration was part of the bad deploy, evaluate whether a data fix is needed before re-rolling forward.

## 6. Communication template

Post in the incident channel and (for SEV1/SEV2) email stakeholders.

```text
[INCIDENT - SEV2] - Worker queue backlog
Started: 2026-05-10 14:32 UTC
Status:  INVESTIGATING | MITIGATING | MONITORING | RESOLVED
Impact:  Transactions delayed; new POSTs accepted but processing latency >5min.
                Approximately ~15% of transactions affected.

Update (14:45 UTC): IC = @rotha. Cause likely partner API slowness; investigating.
Update (15:00 UTC): Scaled worker to 4 replicas. Backlog draining.
Update (15:20 UTC): Backlog cleared. Scaling back to 1. Monitoring.
Resolved (15:35 UTC): Returned to normal. Postmortem due 2026-05-12.
```

For external/customer comms, drop internal jargon and `kubectl` references. State impact, ETA, what you've done.

## 7. Postmortem template

Write within 5 working days of resolution. Blameless — analyze the system, not the person.

```markdown
# Postmortem: <short title>

- Severity: SEV1 / SEV2 / SEV3
- Date detected: YYYY-MM-DD HH:MM UTC
- Date resolved: YYYY-MM-DD HH:MM UTC
- Duration: HH:MM
- Author(s): @name
- Reviewers: @name, @name

## Summary

One paragraph that a non-engineer could read.

## Impact

- User impact: who, how many, how long.
- Business impact: revenue, SLO breach, regulatory.
- Internal impact: paged engineers, time spent.

## Timeline (UTC)

- 14:32 — alert fired: API 5xx rate >5%.
- 14:33 — @rotha paged.
- 14:35 — IC confirmed scope: 100% of POST /transactions/notify failing.
- 14:38 — Identified recent deploy (commit abc123) as suspect.
- 14:40 — Rolled back.
- 14:45 — Error rate returned to baseline.
- 14:50 — Verified end-to-end with a synthetic notification.
- 14:55 — Status changed to RESOLVED.

## Root cause

What technically went wrong, in 1–3 short paragraphs. Use the "5 whys" if useful.

## Detection

How did we find out? Was the alert good enough? Was it loud enough? Was it actionable?

## Response

What went well, what went badly, where we got lucky.

## What we are changing

| #   | Action                                              | Owner   | Due        | Tracker  |
| --- | --------------------------------------------------- | ------- | ---------- | -------- |
| 1   | Add validation for X at the boundary                | @name   | 2026-05-20 | TICKET-1 |
| 2   | Add alert on Y                                      | @name   | 2026-05-25 | TICKET-2 |
| 3   | Document Z in runbook                               | @name   | 2026-05-15 | TICKET-3 |

## Where we got lucky

Anything that prevented this from being worse.

## Glossary

Acronyms / internal terms a future reader might not know.
```

## 8. After-action

- File follow-ups in your tracker. Do not let action items rot in the postmortem doc.
- Add a runbook entry for any new failure mode you discovered.
- Add or tighten an alert if detection was slow.
- Share the write-up — postmortems are training material.
