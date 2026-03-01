import { describe, it, expect, afterEach, vi } from 'vitest';
import * as cacache from 'cacache';
import { clearCacheTestEnv, createTempDirTracker, setCacheTestEnv } from '../test-utils/test-helpers';

const { createTempDir, cleanupTempDirs } = createTempDirTracker();

async function loadCacheModule(options?: {
  cacheEnabled?: boolean;
  ttlHours?: number;
  maxSizeMb?: number;
  sweepIntervalMinutes?: number;
}) {
  const cacheDir = await createTempDir('cache-utils-');
  const tempDir = await createTempDir('cache-utils-temp-');

  vi.resetModules();
  vi.clearAllMocks();

  setCacheTestEnv({
    tempDir,
    cacheDir,
    cacheEnabled: options?.cacheEnabled,
    ttlHours: options?.ttlHours,
    maxSizeMb: options?.maxSizeMb,
    sweepIntervalMinutes: options?.sweepIntervalMinutes
  });

  const mod = await import('./cache');
  return { ...mod, cacheDir };
}

afterEach(async () => {
  await cleanupTempDirs();
  clearCacheTestEnv();
});

describe('cache utility', () => {
  it('should generate deterministic cache keys for identical input', async () => {
    const { computeCacheKey } = await loadCacheModule();
    const input = Buffer.from('same-input');
    const params = { quality: 2, mode: 'fit' };

    const key1 = computeCacheKey(input, 'audio:mp3', params);
    const key2 = computeCacheKey(input, 'audio:mp3', params);

    expect(key1).toBe(key2);
  });

  it('should generate different keys for different params and job types', async () => {
    const { computeCacheKey } = await loadCacheModule();
    const input = Buffer.from('same-input');

    const keyA = computeCacheKey(input, 'audio:mp3', { quality: 2 });
    const keyB = computeCacheKey(input, 'audio:mp3', { quality: 7 });
    const keyC = computeCacheKey(input, 'video:mp4', { quality: 2 });

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it('should strip runtime path and S3 keys from cacheable params', async () => {
    const { extractCacheableParams } = await loadCacheModule();
    const params = extractCacheableParams({
      inputPath: '/tmp/input',
      outputPath: '/tmp/output',
      outputDir: '/tmp/frames',
      jobDir: '/tmp/job',
      uploadToS3: true,
      quality: 2,
      nested: {
        outputPath: '/tmp/nested',
        mode: 'fit'
      }
    });

    expect(params).toEqual({
      nested: { mode: 'fit' },
      quality: 2
    });
  });

  it('should round-trip cached output', async () => {
    const { initCacheDir, putCachedOutput, getCachedOutput } = await loadCacheModule();
    await initCacheDir();

    const key = 'roundtrip-key';
    const output = Buffer.from('converted-output');
    await putCachedOutput(key, output, 'audio:mp3', 'mp3', { codec: 'mp3' });

    const cached = await getCachedOutput(key);
    expect(cached?.outputBuffer.toString()).toBe('converted-output');
    expect(cached?.metadata).toEqual({ codec: 'mp3' });
  });

  it('should treat expired entries as cache misses', async () => {
    const { initCacheDir, getCachedOutput, cacheDir } = await loadCacheModule({ ttlHours: 1 });
    await initCacheDir();

    const key = 'expired-key';
    await cacache.put(cacheDir, key, Buffer.from('old-data'), {
      metadata: {
        createdAt: Date.now() - 2 * 60 * 60 * 1000,
        jobType: 'audio:mp3',
        outputExtension: 'mp3'
      }
    });

    const cached = await getCachedOutput(key);
    expect(cached).toBeNull();
  });

  it('should evict oldest entries when cache exceeds max size', async () => {
    const { initCacheDir, putCachedOutput, getCachedOutput } = await loadCacheModule({ maxSizeMb: 1 });
    await initCacheDir();

    const keyOld = 'old-entry';
    const keyNew = 'new-entry';
    const payload = Buffer.alloc(700 * 1024, 1);

    await putCachedOutput(keyOld, payload, 'audio:mp3', 'mp3');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await putCachedOutput(keyNew, payload, 'audio:mp3', 'mp3');

    const oldEntry = await getCachedOutput(keyOld);
    const newEntry = await getCachedOutput(keyNew);

    expect(oldEntry).toBeNull();
    expect(newEntry).not.toBeNull();
  });

  it('should no-op when cache is disabled', async () => {
    const { putCachedOutput, getCachedOutput } = await loadCacheModule({ cacheEnabled: false });
    await putCachedOutput('disabled-key', Buffer.from('data'), 'audio:mp3', 'mp3');

    const cached = await getCachedOutput('disabled-key');
    expect(cached).toBeNull();
  });
});
