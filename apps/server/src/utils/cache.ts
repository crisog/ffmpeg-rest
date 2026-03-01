import { createHash } from 'crypto';
import { mkdir } from 'fs/promises';
import * as cacache from 'cacache';
import { z } from 'zod';
import { env } from '~/config/env';
import { logger } from '~/config/logger';

const EXCLUDED_KEYS = new Set(['inputPath', 'outputPath', 'outputDir', 'jobDir', 'uploadToS3']);

const CacheMetadataSchema = z.object({
  createdAt: z.number(),
  jobType: z.string(),
  outputExtension: z.string(),
  resultMetadata: z.record(z.string(), z.unknown()).optional()
});

type CacheMetadata = z.infer<typeof CacheMetadataSchema>;

interface CacheHit {
  outputBuffer: Buffer;
  metadata?: Record<string, unknown>;
}

interface CacheEntryLike {
  key: string;
  size: number;
  time: number;
  metadata?: unknown;
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeValue(item);
      return normalized === undefined ? null : normalized;
    });
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      if (EXCLUDED_KEYS.has(key)) {
        continue;
      }

      const normalizedValue = normalizeValue(record[key]);
      if (normalizedValue !== undefined) {
        normalized[key] = normalizedValue;
      }
    }

    return normalized;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function isMissingCacheEntryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: string }).code;
  return code === 'ENOENT' || code === 'ENODATA';
}

function getMaxCacheBytes(): number {
  return env.CACHE_MAX_SIZE_MB * 1024 * 1024;
}

function ttlMs(): number {
  return env.CACHE_TTL_HOURS * 60 * 60 * 1000;
}

function parseCacheMetadata(metadata: unknown): CacheMetadata | null {
  const parsed = CacheMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}

function getEntryTimestamp(entry: CacheEntryLike): number {
  const metadata = parseCacheMetadata(entry.metadata);
  return metadata?.createdAt ?? entry.time;
}

function isExpiredByTimestamp(timestamp: number): boolean {
  return Date.now() - timestamp > ttlMs();
}

function isExpiredEntry(entry: CacheEntryLike): boolean {
  return isExpiredByTimestamp(getEntryTimestamp(entry));
}

async function runVerifyAfterRemovals(hadRemovals: boolean): Promise<void> {
  if (!hadRemovals) {
    return;
  }

  try {
    await cacache.verify(env.CACHE_DIR, { concurrency: 8 });
  } catch (error) {
    logger.warn({ error }, 'Cache verify failed after retention cleanup');
  }
}

export function isCacheEligibleJobData(jobDataResult: Record<string, unknown>): boolean {
  const uploadToS3 = jobDataResult['uploadToS3'];
  return uploadToS3 !== true;
}

export function extractCacheableParams(jobDataResult: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeValue(jobDataResult);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return {};
  }
  return normalized as Record<string, unknown>;
}

export function computeCacheKey(fileBuffer: Buffer, jobType: string, params: Record<string, unknown>): string {
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  hash.update('\0');
  hash.update(jobType);
  hash.update('\0');
  hash.update(stableStringify(params));
  return hash.digest('hex');
}

export async function getCachedOutput(cacheKey: string): Promise<CacheHit | null> {
  if (!env.CACHE_ENABLED) {
    return null;
  }

  try {
    const entry = await cacache.get(env.CACHE_DIR, cacheKey, { memoize: false });
    const metadata = parseCacheMetadata(entry.metadata);

    if (!metadata) {
      await cacache.rm.entry(env.CACHE_DIR, cacheKey);
      logger.warn({ cacheKey }, 'Removed cache entry with invalid metadata');
      return null;
    }

    if (isExpiredByTimestamp(metadata.createdAt)) {
      await cacache.rm.entry(env.CACHE_DIR, cacheKey);
      return null;
    }

    return {
      outputBuffer: entry.data,
      metadata: metadata.resultMetadata
    };
  } catch (error) {
    if (isMissingCacheEntryError(error)) {
      return null;
    }

    logger.warn({ error, cacheKey }, 'Failed to read cache entry');
    return null;
  }
}

async function enforceCacheRetention(requiredSpaceBytes = 0): Promise<void> {
  if (!env.CACHE_ENABLED) {
    return;
  }

  const maxBytes = getMaxCacheBytes();
  if (requiredSpaceBytes > maxBytes) {
    return;
  }

  try {
    const entriesMap = await cacache.ls(env.CACHE_DIR);
    const entries = Object.values(entriesMap) as CacheEntryLike[];
    let hadRemovals = false;

    const activeEntries: CacheEntryLike[] = [];

    for (const entry of entries) {
      if (isExpiredEntry(entry)) {
        await cacache.rm.entry(env.CACHE_DIR, entry.key);
        hadRemovals = true;
      } else {
        activeEntries.push(entry);
      }
    }

    let currentSize = activeEntries.reduce((total, entry) => total + entry.size, 0);
    const sortedByAge = activeEntries.sort((a, b) => getEntryTimestamp(a) - getEntryTimestamp(b));

    while (currentSize + requiredSpaceBytes > maxBytes && sortedByAge.length > 0) {
      const oldest = sortedByAge.shift();
      if (!oldest) {
        break;
      }

      await cacache.rm.entry(env.CACHE_DIR, oldest.key);
      currentSize -= oldest.size;
      hadRemovals = true;
    }

    await runVerifyAfterRemovals(hadRemovals);
  } catch (error) {
    logger.warn({ error }, 'Failed to enforce cache retention');
  }
}

export async function putCachedOutput(
  cacheKey: string,
  outputBuffer: Buffer,
  jobType: string,
  outputExtension: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!env.CACHE_ENABLED) {
    return;
  }

  const maxBytes = getMaxCacheBytes();
  if (outputBuffer.length > maxBytes) {
    logger.debug({ cacheKey, size: outputBuffer.length }, 'Skipping cache write because output exceeds max cache size');
    return;
  }

  try {
    await enforceCacheRetention(outputBuffer.length);

    await cacache.put(env.CACHE_DIR, cacheKey, outputBuffer, {
      metadata: {
        createdAt: Date.now(),
        jobType,
        outputExtension,
        resultMetadata: metadata
      }
    });
  } catch (error) {
    logger.warn({ error, cacheKey }, 'Failed to write cache entry');
  }
}

export async function initCacheDir(): Promise<void> {
  if (!env.CACHE_ENABLED) {
    return;
  }

  await mkdir(env.CACHE_DIR, { recursive: true });
  await enforceCacheRetention();
}

export function startCacheCleanup(): () => void {
  if (!env.CACHE_ENABLED) {
    return () => {
      // noop
    };
  }

  const intervalMs = env.CACHE_SWEEP_INTERVAL_MINUTES * 60 * 1000;
  const timer = setInterval(() => {
    void enforceCacheRetention();
  }, intervalMs);

  timer.unref();

  return () => {
    clearInterval(timer);
  };
}
