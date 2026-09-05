# Kayf Profile Counter

A production-oriented, self-hosted profile-view badge and analytics service for Docker Desktop. It renders SVG badges itself, stores counters and bounded analytics in Redis, and serves a compact React admin dashboard from the same Fastify container.

No request path contacts GitHub, Komarev, Shields.io, or another analytics provider. The included k6 tooling is restricted to localhost, Compose services, private networks, or a remote target you explicitly authorize.

## Architecture

```text
Browser / badge request                  Optional, profile-gated
          │                              k6 load-test container
          ▼                                       │
┌────────────────────────┐                        │ http://app:3000
│ Fastify app            │◀───────────────────────┘
│ localhost:3000         │
│ API + SVG + React UI   │
└───────────┬────────────┘
            │ redis://redis:6379
            ▼
┌────────────────────────┐
│ Redis 7                │
│ Compose network only   │
│ AOF + named volume     │
└────────────────────────┘
```

The normal stack has only `app` and `redis`. The dashboard is built by Vite and copied into the app image; a separate frontend container would add lifecycle overhead without a deployment benefit here. Atomic Lua operations own counter, uniqueness, rate-limit, and analytics updates so concurrent requests cannot lose increments.

## Docker Desktop quick start

No local Node.js, Redis, pnpm, or k6 installation is required.

```bash
docker compose up -d --build
```

Docker Desktop shows one application named `kayf-profile-counter`:

```text
kayf-profile-counter
├── app
└── redis
```

The profile-gated `loadtest` container appears only while a test is running. Open:

- Service: <http://localhost:3000>
- Badge: <http://localhost:3000/badge/vKAYFv.svg>
- Stats: <http://localhost:3000/api/profiles/vKAYFv/stats>
- Admin: <http://localhost:3000/admin>
- Health: <http://localhost:3000/health>

The Compose development defaults are intentionally convenient, not production secrets. Before any public deployment, create `.env` from `.env.example` and replace `ADMIN_API_KEY` and `UNIQUE_HASH_SECRET` with long random values.

> GitHub cannot fetch an image from your machine's `localhost`. These URLs are for Docker Desktop development and testing. To use the badge in a GitHub profile, deploy this service at a public HTTPS origin that you control and substitute that origin in the image URL.

## Routine Docker workflows

```bash
# Logs (also visible in Docker Desktop's Logs tab)
docker compose logs -f app

# Restart only the app
docker compose restart app

# Stop and remove containers/network, preserving counters
docker compose down

# Start again with the same data
docker compose up -d

# Rebuild everything from scratch without using image-layer cache
docker compose build --no-cache
docker compose up -d
```

### Persistent Redis behavior

Redis is not published to the host. It uses `redis://redis:6379` inside the default Compose network and writes to the named volume `kayf-profile-counter-redis-data`.

```bash
docker compose down       # preserves the named volume and all counters
docker compose down -v    # intentionally deletes the volume and all counters
```

Redis uses AOF with `appendfsync everysec`: this offers good durability with substantially less sync overhead than fsync on every write. A host or VM crash can lose roughly the last second of writes; normal stop/start and `docker compose down` preserve data.

## Badge endpoint

```html
<img
  src="http://localhost:3000/badge/vKAYFv.svg?style=for-the-badge&color=f7b93e&labelColor=1a1b27&label=PROFILE%20VIEWS"
  alt="Profile views"
/>
```

`GET /badge/:profile.svg` accepts:

| Query | Default | Values |
| --- | --- | --- |
| `label` | `PROFILE VIEWS` | 1–40 characters |
| `style` | `for-the-badge` | `flat`, `flat-square`, `for-the-badge` |
| `color` | `f7b93e` | six-digit hex |
| `labelColor` | `1a1b27` | six-digit hex |
| `increment` | `true` | `true`, `false` |
| `compact` | `false` | `true`, `false` |

Counts are comma formatted by default (`100000` → `100,000`) or compact (`1250000` → `1.25M`). Width is calculated from the rendered label/value. XML-sensitive content is escaped and the SVG includes a title and accessible label. Responses use `image/svg+xml` and `Cache-Control: no-cache, no-store, must-revalidate`.

Profile names are strictly validated: 1–39 alphanumeric/hyphen characters, with no leading or trailing hyphen.

## Stats API

```bash
curl http://localhost:3000/api/profiles/vKAYFv/stats
```

The response includes lifetime `rawRequests`, `countedViews`, `uniqueViews`, `repeatViews`, `botRequests`, and `rateLimited`, plus `requestsPerMinute`, `requestsPerHour`, `viewsToday`, `viewsLast24h`, and the 60-minute/7-day/30-day history used by the dashboard.

Rolling Redis hashes expire automatically:

- Per-minute data: retained for 2 hours (the API displays 60 minutes)
- Per-hour data: retained for 72 hours (the API displays 24 hours)
- Per-day data: retained for 100 days (the API displays 90-day-safe, last 30 days)

## Admin API and dashboard

Open <http://localhost:3000/admin> and enter `ADMIN_API_KEY`. The key stays in browser `sessionStorage`; it is not embedded in the dashboard build. The dashboard refreshes every five seconds and displays visible/raw/unique/repeat/bot/rejected traffic, current minute/hour rates, today/24-hour counts, and trend charts.

Admin requests accept either `X-API-Key` or `Authorization: Bearer …`:

```bash
curl -H 'X-API-Key: local-admin-key-change-me' \
  http://localhost:3000/api/admin/profiles

curl -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: local-admin-key-change-me' \
  -d '{"scope":"analytics"}' \
  http://localhost:3000/api/profiles/vKAYFv/reset
```

Reset scopes are `all`, `raw`, `counted`, `unique`, and `analytics`. `all` removes all keys for that profile and removes it from the dashboard list. Reset is never available without an API key.

## Counting, bots, and privacy

`COUNT_MODE` controls the visible count:

- `raw`: every eligible, non-rejected request counts.
- `unique`: only the first fingerprint within `UNIQUE_VIEW_TTL_SECONDS` counts.
- `hybrid`: a visitor may count again after `VIEW_COOLDOWN_SECONDS`.

Every badge request increments `rawRequests`, including bots and rejected requests. Conservative user-agent/header detection increments `botRequests`; bots do not affect the visible count unless `COUNT_BOTS=true`. Rate-limited traffic increments `rateLimited` and returns HTTP 429 with `Retry-After: 60`.

The service never stores a plain IP. It hashes IP, user agent, profile, UTC day, and `UNIQUE_HASH_SECRET` with SHA-256. Rate-limit identities are independently salted/hashes. Fingerprint keys expire after the configured unique TTL. The server does not perform invasive device fingerprinting and does not log raw IPs, API keys, or secrets.

## Configuration

Copy `.env.example` to `.env` for durable local overrides. Important settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_PORT` | `3000` | Host port mapped to app port 3000 |
| `REDIS_URL` | `redis://redis:6379` | Internal Redis address (fixed in Compose) |
| `COUNT_MODE` | `unique` | `raw`, `unique`, or `hybrid` |
| `COUNT_BOTS` | `false` | Permit detected bots to count |
| `UNIQUE_VIEW_TTL_SECONDS` | `86400` | Unique fingerprint lifetime |
| `VIEW_COOLDOWN_SECONDS` | `300` | Hybrid repeat cooldown |
| `UNIQUE_HASH_SECRET` | local-only placeholder | Fingerprint salt; use a random production secret |
| `RATE_LIMIT_ENABLED` | `true` | Enable Redis-backed limits |
| `RATE_LIMIT_PER_IP_PER_MINUTE` | `100` | Per salted identity limit |
| `RATE_LIMIT_GLOBAL_PER_MINUTE` | `10000` | Whole-service minute limit |
| `ADMIN_API_KEY` | local-only placeholder | Admin API/dashboard credential |
| `LOG_LEVEL` | `info` | Pino level; use `warn` for benchmarks |
| `ALLOW_TEST_VISITOR_HEADER` | `false` | Test-only deterministic identity input |

The app listens on `0.0.0.0:3000` in its container. Redis reconnect uses exponential backoff; `/health` returns 503 until Redis is available and returns to 200 after recovery.

## Dockerized load testing

> **Safety:** Run these scenarios only against localhost, services you own, or infrastructure you have explicit permission to test. Never test GitHub, Komarev, Shields.io, or an unrelated external service. The scripts hard-refuse those domains. Other public targets require `ALLOW_REMOTE_TARGET=true`, which is an explicit acknowledgement—not proof of authorization.

The default target inside Compose is `http://app:3000`, never container-local `localhost`.

### Exact 100,000-request scenario

For an unconstrained benchmark, recreate the app with limits disabled and normal request logs suppressed:

```bash
RATE_LIMIT_ENABLED=false LOG_LEVEL=warn docker compose up -d --build --force-recreate app
docker compose --profile loadtest run --rm loadtest
```

The scenario performs exactly `TOTAL_REQUESTS` shared iterations (default 100,000 at 100 VUs), then fetches stats and reports the raw-request delta and all main counters.

```bash
docker compose --profile loadtest run --rm \
  -e SCENARIO=100k -e TOTAL_REQUESTS=20000 -e VUS=50 loadtest

docker compose --profile loadtest run --rm -e SCENARIO=burst loadtest
```

The burst ramps from 0 to 500 VUs, holds, then returns to 0. k6's summary reports `http_reqs`/s, average, median (p50), p95, p99, maximum latency, and failed/check rates. Throughput depends on host CPU, Docker Desktop VM resources, OS, VUs, AOF, and logging; this project does not ship fabricated benchmark claims.

Suggested—not mandatory—for the 100k run: 4+ Docker Desktop CPUs and 4–8 GB memory.

### Deterministic unique and repeat scenarios

`X-Test-Visitor-ID` is honored only when both safety gates are set on the app. This must not be enabled in production:

```bash
NODE_ENV=test ALLOW_TEST_VISITOR_HEADER=true RATE_LIMIT_ENABLED=false COUNT_MODE=unique \
  docker compose up -d --build --force-recreate app

docker compose --profile loadtest run --rm -e SCENARIO=unique loadtest
docker compose --profile loadtest run --rm -e SCENARIO=repeat loadtest
```

The repeat scenario emits 100 synthetic visitors × 1,000 requests. On a fresh `repeat-test` profile in unique mode it reports a raw delta of 100,000 and a unique delta of 100. Reset that profile between comparison runs, or account for existing lifetime counters.

Restore normal production-like defaults afterward:

```bash
docker compose up -d --force-recreate app
```

## Development and tests

Docker-based hot reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

For contributors with Node.js 22+ and Corepack/pnpm:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Unit tests cover profile validation, UTC periods, SVG escaping/width/formatting, fingerprints, bot detection, health, badge headers, request validation, rate-limit responses, and admin authentication. The profile-gated integration suite uses real Redis and includes 10,000 concurrent increments plus unique TTL, repeat, all counting modes, bots, rate limits, and connection lifecycle:

```bash
docker compose --profile test run --rm test
```

## Docker Desktop troubleshooting

### Port 3000 is already in use

Set `APP_PORT=3001` in `.env` (equivalent to changing `3000:3000` to `3001:3000`) and recreate the app. Use <http://localhost:3001>.

### Redis volume reset

`docker compose down` preserves counters. `docker compose down -v` permanently deletes the named volume and its Redis data. Start again with `docker compose up -d --build`.

### App cannot reach Redis

Inside Compose, the correct URL is `redis://redis:6379`, not `redis://localhost:6379`. Check both health states in Docker Desktop and run:

```bash
docker compose logs app
docker compose logs redis
```

### Container exits or remains unhealthy

```bash
docker compose ps
docker compose logs app
docker compose config
```

Confirm required values satisfy `.env.example`, then rebuild with `docker compose build --no-cache` and `docker compose up -d`.

## Production notes

The same Compose topology is portable to a Linux VPS, but production should add a TLS reverse proxy, a public hostname, long random secrets, explicit image tags/digests, host backups for the Redis volume, monitoring, and an appropriate proxy/IP trust policy. Redis intentionally has no host port. Keep rate limiting enabled, do not enable the test visitor header, and expose only the app through HTTPS.

For multi-instance deployment, all instances may share Redis because mutations are atomic. Review global rate-limit capacity, Redis persistence/backup objectives, and reverse-proxy client-IP handling before scaling. This first version deliberately stays Redis-only; PostgreSQL adds no necessary durability/query capability for these bounded counters.
