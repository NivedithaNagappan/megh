---
title: Health Checks
description: Liveness and readiness endpoints for load balancers and orchestrators.
---

# Health Checks

`app.useHealth()` adds two routes for load balancers, Kubernetes probes and
uptime monitors:

| Route | Answers | Use it for |
|-------|---------|------------|
| `GET /health` | `200 { "status": "ok" }` while the process serves requests | Liveness: restart the process when it stops answering |
| `GET /ready` | `200` when every check passes, `503` when one fails | Readiness: stop sending traffic until dependencies are back |

```ts
app
  .useMeghORM({ dialect: 'postgres', url: process.env.DATABASE_URL })
  .useHealth({
    checks: {
      redis: () => redis.ping(),
    },
  });
```

```json
// GET /ready
{
  "status": "ok",
  "checks": {
    "database": { "status": "up", "durationMs": 2 },
    "redis": { "status": "up", "durationMs": 1 }
  }
}
```

Megh ORM registers the `database` check itself (`select 1`), so you only add
checks for the services you connect to yourself.

## Checks

A check is a function. It passes unless it throws, rejects or returns
`false`. Checks run concurrently, and one that takes longer than `timeout`
counts as down.

```ts
app.addHealthCheck('payments-api', async () => {
  const res = await fetch('https://payments.internal/ping');
  return res.ok;
});
```

Plugins add checks with `ctx.addHealthCheck(name, check)`, the same way Megh
ORM does.

When a check fails, `/ready` answers 503 with the check marked `down`. The
failure reason is included as `error` only when `NODE_ENV=development`,
since it can describe internal hosts or credentials.

## Options

| Option | Default | |
|--------|---------|---|
| `path` | `/health` | Liveness route |
| `readyPath` | `/ready` | Readiness route |
| `checks` | `{}` | Checks to add, by name |
| `timeout` | `5000` | Milliseconds before a check counts as failed |

Call `useHealth()` before `run()`. The routes are hidden from the OpenAPI
document and skip middleware (including global `useMiddlewares`) and
`@Authorized`, so probes still answer behind an API key check. Keep them
off the public internet if the check names are sensitive.

## Kubernetes

```yaml
livenessProbe:
  httpGet: { path: /health, port: 4000 }
readinessProbe:
  httpGet: { path: /ready, port: 4000 }
```
