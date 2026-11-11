# Benchmarks

HTTP throughput of Megh against raw Fastify, Express, and NestJS on both of its
adapters. Every server exposes the same three routes:

| Scenario       | Route                       | What it measures                                    |
| -------------- | --------------------------- | --------------------------------------------------- |
| JSON           | `GET /hello`                | Routing plus JSON serialization: framework overhead |
| Params         | `GET /users/42?fields=name` | Path and query parameter extraction                 |
| Validated body | `POST /users`               | Body parsing plus validation of a 3-field DTO       |

## Run it

```bash
cd benchmarks
npm run setup   # build and pack ../packages/core, install everything
npm run bench   # compile the servers, run all scenarios
```

`setup` packs the local `@meghjs/core` and installs the tarball instead of
linking it, so Megh shares the same single copy of class-validator and
class-transformer as the other servers. Re-run `setup` after changing core.

Options (environment variables):

| Variable      | Default  |                                                                   |
| ------------- | -------- | ----------------------------------------------------------------- |
| `ONLY`        | all five | Comma-separated: `fastify,megh,nest-fastify,express,nest-express` |
| `DURATION`    | `10`     | Seconds per timed run                                             |
| `RUNS`        | `3`      | Timed runs per scenario; the median is reported                   |
| `CONNECTIONS` | `100`    | Concurrent autocannon connections                                 |
| `PORT`        | `3999`   | Port the servers listen on                                        |

Results print to the console and are written to `results.json`.

## Method

- One server at a time, each in its own Node process with
  `NODE_ENV=production` and request logging off.
- Before loading a server, `run.js` checks it does the same work as the others.
  It must accept a valid body, reject an invalid body and an unknown property
  with 400, and return `id` and `fields` as strings. A server that fails is
  reported and skipped.
- Each scenario gets a 3 s warm-up, then `RUNS` timed runs of `DURATION`
  seconds with [autocannon](https://github.com/mcollina/autocannon). The median
  req/s and p99 latency are reported.
- Validation: Megh, NestJS and Express use class-validator with
  `whitelist` + `forbidNonWhitelisted`. Fastify uses its native JSON schema
  (ajv) with `additionalProperties: false` and `removeAdditional` off, so it
  rejects unknown properties instead of stripping them.

Versions are pinned in `package.json`: Fastify 5.12.8, Express 5.3.0,
NestJS 12.4.2, class-validator 0.15.1, autocannon 9.0.0.

## Results

2026-11-11, Megh 0.5.4 (`main`), Node 24.14.0, Windows 11, Intel i5-11320H
(4 cores / 8 threads), 100 connections, 3 × 10 s, median req/s:

| Server           |       JSON |     Params | Validated body |
| ---------------- | ---------: | ---------: | -------------: |
| Fastify (raw)    |     20,607 |     20,412 |         16,375 |
| **Megh**         | **19,073** | **17,656** |      **8,951** |
| NestJS + Fastify |     17,683 |     16,437 |          8,785 |
| Express          |     12,761 |     11,987 |          7,681 |
| NestJS + Express |     12,075 |     10,180 |          6,822 |

p99 latency for Megh: 8 ms, 9 ms and 16 ms. No errors or non-2xx responses in
any run.

The Megh params row was measured with `id: number`. `id: string` returned 400
until the `autoCast` fix that landed with this folder; the fix adds no cost to
that path.

### Reading the numbers

- On simple routes Megh keeps 86–93% of raw Fastify's throughput and is ahead
  of NestJS on Fastify by about 8%.
- With a validated body, Megh and NestJS are level (both pay for
  class-validator) at about 55% of Fastify's compiled JSON-schema validation.
  This is where Megh's speed is spent, and the clearest optimization target:
  Megh already builds a JSON schema from each DTO for OpenAPI.
- Express-based servers trail on every route.

Laptop numbers are noisy: background load and thermal throttling can easily
move results by 2×. Compare servers within one run, not across runs. Before
quoting numbers publicly, re-run on a quiet Linux machine.
