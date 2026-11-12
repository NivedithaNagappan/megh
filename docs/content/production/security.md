---
title: Security Hardening
description: What Megh protects by default, and the checklist for running an app in production.
---

# Security Hardening

Megh ships with safe defaults for the parts it owns. The rest, such as CORS,
security headers and rate limits, depends on your app and is up to you.

## What Megh does by default

### `@Authorized` fails closed

A route marked `@Authorized` (or `.authorized()` on an inline route) is never
served without an authorization handler. If you forget
`app.useAuthorization(...)`, every request gets **403**, and startup logs a
warning:

```text
GET /admin uses @Authorized but no authorization handler is registered;
every request will be denied (403). Call app.useAuthorization(YourAuthorization).
```

An `authorize` method that returns `false` also answers 403. See
[Authentication](/core-concept/authentication).

### DTOs reject unknown properties

`@Body()` and `@Query()` DTOs are validated with `whitelist` and
`forbidNonWhitelisted`. A property the DTO doesn't declare fails with 400, so
a client can't slip `isAdmin: true` into a model. See
[Validation](/core-concept/validation).

### 5xx details stay on the server

Unless `NODE_ENV=development`, a 5xx response is only:

```json
{ "code": 500, "status": "Error", "message": "Internal Server Error" }
```

The real message, payload and stack are logged, not sent. 4xx messages are
sent as written, so don't put internal details in them. `/ready` likewise
hides why a health check failed outside development.

### Uploads stay in their folder

`FileStorage` treats uploads as untrusted. By default it:

- saves files under a random UUID name that keeps the extension;
- rejects filenames containing `/`, `\`, `..` or null bytes;
- keeps every path, including `to`, inside `baseDir`. When reading a stored
  file it checks this again after following symlinks;
- accepts only an allowlist of extensions (images, PDF, office files,
  text/CSV, zip, audio and video). HTML, SVG and JS are rejected;
- never overwrites an existing file.

The MIME type is not checked unless you set `allowedMimeTypes`. See
[File Uploads](/advanced/file-uploads).

### Download headers are escaped

`Results.OkStream(stream, { filename })` builds `Content-Disposition` so a
filename can't inject headers: the plain `filename` keeps only safe ASCII and
the real name goes in the RFC 5987 `filename*` parameter.

### Logs leave out credentials

- Error logs record the method, URL, status and error. Request headers and
  bodies are not logged.
- Database passwords are replaced by `***` in connection log lines and
  connection errors.
- A client's `x-request-id` is only reused if it matches
  `^[\w.:-]{1,128}$`; anything else is replaced by a generated ID, so it
  can't forge log lines.

The URL includes the query string, so keep tokens out of query parameters.

## Checklist

### Restrict CORS

`useCors` passes its options to `@fastify/cors`. The scaffold uses
`origin: '*'`; list your front-ends instead:

```ts
app.useCors({
  origin: ['https://app.example.com', /\.example\.com$/],
  credentials: true,
});
```

Browsers refuse credentialed requests when the allowed origin is `*`.

### Add security headers and rate limits

Megh has no `useHelmet()` or `useRateLimit()` yet (issue #58). Register the
Fastify plugins on `app.app`, the underlying Fastify instance:

```bash
npm install @fastify/helmet @fastify/rate-limit
```

```ts [src/app.ts]
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

app.onInit(async () => {
  await app.app.register(helmet);
  await app.app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
});
```

`onInit` hooks run before Megh adds your routes in `run()`. `@fastify/rate-limit`
attaches itself to each route as it is added, so it must be registered (and
awaited) first. A blocked request gets 429 with the plugin's message through
Megh's error handler.

`useHealth()` adds its routes when you call it, so `/health` and `/ready`
are not rate-limited by this setup. That is usually what you want for probes.

Behind a load balancer, rate limits are per client IP only with `trustProxy`
set (next section). With several replicas, pass `redis` to
`@fastify/rate-limit` so they share one counter.

If Helmet's Content Security Policy breaks a page you serve, such as Swagger
UI in development, pass `{ contentSecurityPolicy: false }` there or tune the
directives.

### Terminate HTTPS at a proxy

Serve HTTPS from a load balancer, ingress or reverse proxy, and keep the app
on plain HTTP inside the network. Tell Fastify to trust the proxy so
`request.ip`, `request.protocol` and `request.hostname` come from the
`X-Forwarded-*` headers:

```ts
const app = Megh.createApplication({
  server: { trustProxy: true }, // or the proxy's address, e.g. '10.0.0.0/8'
});
```

Only trust a proxy that overwrites those headers, or clients can spoof their
IP. Bind to `127.0.0.1` (`HOST=127.0.0.1`) when the proxy runs on the same
machine. To terminate TLS in Node instead, pass `server.https`.

### Limit body sizes

Fastify rejects JSON bodies over 1 MiB with 413. Lower it if your API takes
small payloads:

```ts
Megh.createApplication({ server: { bodyLimit: 100 * 1024 } }); // 100 KB
```

`useMultipart()` limits each file to 10 MB by default. Set `limits` to
change it, and cap the number of files and fields too:

```ts
app.useMultipart({ limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 } });
```

### Keep secrets in the environment

- Read secrets from environment variables or your platform's secret store.
  The scaffold's `.gitignore` already leaves out `.env` and `.env.local`.
- Don't bake `.env` into images. Add it to `.dockerignore`.
- Fail fast when a secret is missing: `env.getOrThrow('JWT_SECRET')`. See
  [Configuration](/core-concept/configuration).

### Keep the OpenAPI docs in development

`useOpenApi()` serves the docs whenever you call it. Gate it, as the scaffold
does:

```ts
if (app.isDevelopment()) {
  app.useOpenApi(OpenApiConfig);
}
```

If you need public docs, put them behind authentication at the proxy.

### Set `NODE_ENV=production`

Everything above that depends on production mode (hidden 5xx details, hidden
health errors, docs off) needs `NODE_ENV` to be anything but `development`.
See [Deployment](/production/deployment#environment).

### Audit dependencies

```bash
npm audit --omit=dev
npx megh doctor
```

`npm audit` reports known vulnerabilities. `megh doctor` checks that Node,
`@meghjs/core` and the CLI versions line up. Keep Megh, Fastify and the
`@fastify/*` plugins current, and run the audit in CI.
