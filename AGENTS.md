# AGENTS.md — FFmpeg REST API

This file is for coding agents. README.md stays focused on humans.

FFmpeg REST API is a production-ready REST API wrapping FFmpeg for media processing. It accepts media files via HTTP multipart uploads, processes them asynchronously through a BullMQ job queue backed by Redis, and returns results as direct binary responses or S3 URLs.

---

## Architecture

Two separate Node.js processes:

1. **Server** (`src/server.ts`) — Hono HTTP API. Receives uploads, writes to temp disk, enqueues BullMQ jobs, waits for completion via `job.waitUntilFinished()`, returns results.
2. **Worker** (`src/worker.ts`) — BullMQ worker. Consumes jobs from the `ffmpeg-jobs` queue, executes FFmpeg/FFprobe via `child_process.execFile`, returns results through BullMQ.

Both connect to the same Redis instance. The API is **synchronous from the caller's perspective** despite the internal async queue.

```
Client --> [Hono Server] --> [Redis/BullMQ Queue] --> [BullMQ Worker] --> [FFmpeg]
                |                                         |
                |<---- waitUntilFinished -----------------+
```

### Storage modes

Configured via `STORAGE_MODE` env var:

- **`stateless`** (default) — Binary data returned directly in the HTTP response
- **`s3`** — Output uploaded to S3-compatible storage, JSON `{ url }` returned. Every conversion endpoint has a `/url` variant (e.g., `/audio/mp3/url`) that triggers S3 upload

---

## Project structure

```
src/
├── app.ts                    # Hono app factory, route registration, OpenAPI/Scalar/llms.txt
├── server.ts                 # HTTP server entry point
├── worker.ts                 # BullMQ worker entry point
├── config/
│   ├── env.ts                # Zod-validated environment variables
│   ├── logger.ts             # Pino logger config
│   └── redis.ts              # ioredis connection + health check
├── components/               # Feature modules (controller + schema pairs)
│   ├── api/                  # GET /, GET /endpoints
│   ├── audio/                # POST /audio/mp3, /audio/wav, + /url variants
│   ├── video/                # POST /video/mp4, /video/audio, /video/frames, /video/gif, + /url variants
│   ├── image/                # POST /image/jpg, /image/resize, + /url variants
│   └── media/                # POST /media/info (ffprobe)
├── queue/                    # Job processing layer
│   ├── index.ts              # Queue setup, job types enum, addJob(), validateJobResult()
│   ├── audio/                # processAudioToMp3, processAudioToWav
│   ├── video/                # processVideoToMp4, processVideoExtractAudio, processVideoExtractFrames, processVideoToGif
│   ├── image/                # processImageToJpg, processImageResize
│   └── media/                # processMediaProbe
├── utils/
│   ├── job-handler.ts        # processMediaJob() — shared orchestration for all endpoints
│   ├── storage.ts            # S3 upload, SHA-256 hashing, dedup cache
│   ├── schemas.ts            # Shared OpenAPI schemas
│   └── mime-types.ts         # Extension-to-MIME-type mapping
└── test-utils/
    ├── fixtures.ts           # FFmpeg-based test file generators
    ├── probes.ts             # FFprobe-based test assertions
    ├── s3.ts                 # Test helper: ensureBucketExists
    ├── worker.ts             # Test BullMQ worker
    └── integration-setup.ts  # Testcontainers orchestration
```

Each feature area follows the same structure:

- `components/<domain>/schemas.ts` — Route definitions via `@hono/zod-openapi` `createRoute()`
- `components/<domain>/controller.ts` — Route handler implementation
- `queue/<domain>/schemas.ts` — Job data Zod schemas
- `queue/<domain>/processor.ts` — FFmpeg processing logic

---

## Tech stack

| Layer            | Technology                                               |
| ---------------- | -------------------------------------------------------- |
| Runtime          | Node.js 22+, TypeScript (ESM)                            |
| HTTP framework   | Hono via `@hono/node-server`                             |
| API spec         | `@hono/zod-openapi` (OpenAPI 3.0/3.1)                    |
| Validation       | Zod                                                      |
| Job queue        | BullMQ + ioredis (Redis)                                 |
| Media processing | FFmpeg/FFprobe via `child_process.execFile`              |
| Object storage   | `@aws-sdk/client-s3`                                     |
| Logging          | Pino                                                     |
| Build            | esbuild (bundles server and worker separately)           |
| Testing          | Vitest + testcontainers                                  |
| Linting          | ESLint (typescript-eslint strict + stylistic) + Prettier |
| Git hooks        | Husky + lint-staged                                      |

---

## Commands

```bash
# Install
npm install

# Dev (two terminals)
npm run dev          # Server with auto-reload (tsx watch)
npm run dev:worker   # Worker with auto-reload

# Build
npm run build        # esbuild bundles both server and worker to dist/

# Start (production)
npm start            # Runs both server + worker via concurrently

# Test
npm run test:app          # App tests (needs FFmpeg + Redis via testcontainers)
npm run test:integration  # Integration tests (needs FFmpeg + Docker)

# Other
npm run typecheck    # tsc --noEmit
npm run format       # prettier --write .
```

### Infrastructure for local dev

```bash
docker-compose up -d   # Starts Redis (redis:7-alpine)
```

FFmpeg and FFprobe must be installed and available in PATH.

---

## Testing

### Two test modes

**App tests** (`npm run test:app`):

- Sets `TEST_MODE=app`, excludes `integration.test.ts` files
- Global setup starts a Redis container via `@testcontainers/redis`
- Tests run in-process: creates the Hono app directly, spins up a test BullMQ worker, makes requests via `app.request()`
- Requires FFmpeg installed locally

**Integration tests** (`npm run test:integration`):

- Sets `TEST_MODE=integration`, only runs `integration.test.ts` files
- Global setup spins up Redis, LocalStack (S3), and the app container via testcontainers
- Tests make real HTTP requests to the containerized API
- Requires Docker; can use a pre-built image via `FFMPEG_REST_TEST_IMAGE` env var

### Test structure

Each component has:

- `controller.test.ts` — App-level tests (in-process Hono + test worker)
- `integration.test.ts` — Full end-to-end through containerized app

Each processor has:

- `processor.test.ts` — Unit tests with real FFmpeg, generate fixtures via `ffmpeg -f lavfi`

### Test utilities (`src/test-utils/`)

- `fixtures.ts` — Generates test media files (PNG, WAV, MP3, AVI) using FFmpeg lavfi sources
- `probes.ts` — FFprobe-based assertions (dimensions, codecs, channels, zip entry count)
- `s3.ts` — `ensureBucketExists` helper for S3 tests
- `worker.ts` — Creates a test BullMQ worker for app-level tests

### Test guidelines

- Test behavior, not mocks. Use real FFmpeg and real containers.
- Use test utilities from `src/test-utils/` for generating fixtures and probing outputs.
- Probe returned media to verify actual properties (codec, dimensions, channels), not just status codes.

---

## Conventions

### Code style

- **ESM modules** — All source uses ESM (`"type": "module"` in package.json)
- **Path alias** — Use `~/` for imports from `src/` (e.g., `import { env } from '~/config/env'`)
- **Prettier config** — Single quotes, no trailing commas, 2-space indent, 120 char print width, semicolons
- **Strict TypeScript** — `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`
- **ESLint** — `typescript-eslint` strict + stylistic configs

### Patterns

- **Schema-first API** — Every route is defined via `createRoute()` from `@hono/zod-openapi`, which provides request validation, response schemas, OpenAPI docs, and type inference simultaneously
- **Dual endpoint pattern** — Every conversion endpoint has a binary variant (`/path`) and an S3 variant (`/path/url`). The controller sets `uploadToS3: true` in job data for `/url` routes
- **Shared job handler** — All media endpoints (except `/media/info`) use `processMediaJob()` from `utils/job-handler.ts` for consistent orchestration (temp dir management, job enqueueing, result validation, cleanup)
- **Safe FFmpeg execution** — Always use `execFile` (never `exec`) to prevent shell injection. 10-minute timeout on all FFmpeg commands
- **Zod everywhere** — Environment variables, job data, API schemas, and results are all Zod-validated

### Adding a new endpoint

1. Create `queue/<domain>/schemas.ts` with Zod schemas for the job data
2. Create `queue/<domain>/processor.ts` with the FFmpeg processing function
3. Register the processor in `src/worker.ts`
4. Create `components/<domain>/schemas.ts` with `createRoute()` definitions
5. Create `components/<domain>/controller.ts` using `processMediaJob()` for orchestration
6. Register routes in `src/app.ts`
7. Add tests: `processor.test.ts`, `controller.test.ts`, `integration.test.ts`

### Environment variables

All environment variables are Zod-validated in `src/config/env.ts`. See `.env.example` for the full list. Key ones:

- `REDIS_URL` — Redis connection (default: `redis://localhost:6379`)
- `STORAGE_MODE` — `stateless` or `s3`
- `WORKER_CONCURRENCY` — BullMQ concurrency (default: 5)
- `AUTH_TOKEN` — Optional bearer token; when set, all routes require authentication

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main` and on PRs:

1. **app-tests** — Installs FFmpeg, Node.js 22, runs `npm run test:app`
2. **integration-tests** — Installs FFmpeg, builds Docker image, runs `npm run test:integration`

After making changes, ensure both `npm run test:app` and `npm run typecheck` pass before committing. Run `npm run format` to fix formatting. Pre-commit hooks (Husky + lint-staged) will run ESLint and Prettier on staged `.ts`/`.js` files automatically.
