# FFmpeg REST API

A REST API that wraps FFmpeg for media processing operations. Built with Node.js, Hono, and BullMQ for reliable async job processing.

<p align="center">
  <img src="docs-preview.png" alt="API Documentation Preview" width="800">
</p>

<p align="center">
  <a href="https://railway.com/deploy/ffmpeg-rest-api?referralCode=crisog">
    <img src="https://railway.app/button.svg" alt="Deploy on Railway">
  </a>
</p>

## Features

Convert and process media files through simple HTTP endpoints:

- **Video**: Convert any video to MP4, convert to animated GIF, extract audio tracks (mono/stereo), extract frames at custom FPS (compressed as ZIP/GZIP)
- **Audio**: Convert any audio to MP3 or WAV
- **Image**: Convert any image format to JPG, resize images while preserving format
- **Media Info**: Probe any media file for metadata and stream information

## Architecture

The service runs as two separate Node.js processes connected through Redis:

1. **API Server** (`apps/server/src/server.ts`): Hono HTTP API that accepts uploads, writes temp files, enqueues BullMQ jobs, waits for completion, and returns the result.
2. **Worker** (`apps/worker/src/worker.ts`): BullMQ consumer that executes FFmpeg/FFprobe jobs and returns job results.

From the client perspective, requests are synchronous even though processing is queued internally.

```text
Client -> Hono Server -> Redis/BullMQ -> Worker -> FFmpeg/FFprobe
           ^                                  |
           +----------- wait for result ------+
```

### Monorepo Layout

This project uses npm workspaces:

- `apps/server` - HTTP API server
- `apps/worker` - BullMQ worker
- `apps/web` - Vite + TanStack Router frontend scaffold
- `packages/shared` - shared queue contracts/schemas and pure utilities

## Storage Modes

The API supports two storage modes configured via the `STORAGE_MODE` environment variable:

- **`stateless`** (default) - Files returned directly in HTTP responses
- **`s3`** - Files uploaded to S3-compatible storage, URLs returned

### Stateless Mode (Default)

Files are processed and returned directly in the HTTP response. Simple and straightforward for immediate consumption.

**Cost Consideration**: On Railway, stateless mode is cheaper than running S3 Mode unless you have free egress at your S3-storage provider (like Cloudflare R2). Railway charges $0.05 per GB egress vs S3's typical $0.09 per GB, but you trade off file persistence - processed files aren't stored for later retrieval.

### S3 Mode

Processed files are uploaded to S3-compatible storage and a URL is returned. This mode significantly reduces egress bandwidth costs since users download the processed files directly from S3 rather than through your API server. Ideal for production deployments where bandwidth costs matter.

**Why Cloudflare R2?** R2 is S3-compatible and offers no egress fees, which dramatically lowers costs when serving processed media from your bucket via Cloudflare's global network. While any S3-compatible storage works, R2 is the only major provider with zero egress charges—making it the optimal choice for media delivery.

Configure S3 mode by setting `STORAGE_MODE=s3` and providing S3 credentials in your environment variables.

#### Content Deduplication

S3 Mode includes intelligent content-based deduplication to optimize storage costs and upload performance:

- **SHA-256 File Hashing**: Each processed file is hashed using SHA-256 before upload
- **Redis Cache**: File hashes are mapped to S3 URLs with a 90-day TTL (configurable)
- **Automatic Deduplication**: Identical files are only uploaded once - subsequent requests return the cached S3 URL
- **Zero-Cost Cache Hits**: When a duplicate file is processed, the upload to S3 is skipped entirely
- **Graceful Degradation**: Cache failures don't block uploads - the system falls back to normal upload behavior

**Configuration**:

```bash
S3_DEDUP_ENABLED=1           # Enable/disable deduplication (default: true)
S3_DEDUP_TTL_DAYS=90         # Cache TTL in days (default: 90)
```

This feature dramatically reduces S3 storage costs and upload bandwidth for workloads with duplicate media content, while improving response times through cache hits.

## Documentation

This API is built with documentation-first approach using **Hono Zod OpenAPI** and **Scalar**:

- **Type-Safe Schemas**: All endpoints use Zod schemas for validation, ensuring type safety and automatic OpenAPI spec generation
- **Interactive API Reference**: Beautiful, interactive documentation powered by Scalar at `/reference`
- **OpenAPI Spec (`/doc`)**: Complete machine-readable API specification (served as OpenAPI 3.0)
- **LLM-Friendly Docs (`/llms.txt`)**: Markdown documentation optimized for AI assistants (generated from OpenAPI 3.1, following [llmstxt.org](https://llmstxt.org/) standard)

Every endpoint is fully documented with request/response schemas, validation rules, and example payloads. No manual documentation maintenance required.

## Quick Start

### Prerequisites

- **Node.js** 22+ and npm
- **FFmpeg** and **FFprobe** installed and available in PATH
- **Redis** server running

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/crisog/ffmpeg-rest
   cd ffmpeg-rest
   ```

2. **Install dependencies**

   ```bash
   npm ci
   ```

3. **Start Redis** (using Docker)

   ```bash
   docker-compose up -d
   ```

4. **Configure environment**

   ```bash
   cp .env.example .env
   cp apps/web/.env.example apps/web/.env
   # Edit both files with your settings
   ```

5. **Run the API**

   Development mode (with auto-reload):

   ```bash
   # Starts web + server + worker
   npm run dev
   ```

   Or run processes individually:

   ```bash
   npm run dev:server
   npm run dev:worker
   npm run dev:web
   ```

   Production mode:

   ```bash
   npm run build
   npm start
   ```

## Web App + Nitro Proxy

The `apps/web` workspace is a Vite + TanStack Router frontend with a Nitro catch-all proxy for `/api/**`.

- Dev server: `npm run dev:web`
- Proxy route: `apps/web/routes/api/[...path].ts`
- Frontend API client uses Hono RPC (`hc`) with shared `AppType` from the server

Proxy behavior:

- Requests to `/api/**` are forwarded to `BACKEND_URL` (required)
- `Authorization: Bearer ${AUTH_TOKEN}` is injected server-side when `AUTH_TOKEN` is set
- Browser clients do not need to store or submit `AUTH_TOKEN`
- Web dev server runs on `http://localhost:5173` (fixed), API server defaults to `http://localhost:3000`

Environment variables:

```bash
BACKEND_URL=http://localhost:3000
AUTH_TOKEN=your-api-token
WEB_PASSWORD=
```

## Contribution Policy

FFmpeg REST is open source but only accepting contributions for bug fixes.
