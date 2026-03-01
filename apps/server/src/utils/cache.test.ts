import { describe, it, expect, afterEach, vi } from 'vitest';
import * as cacache from 'cacache';
import { readdir } from 'fs/promises';
import path from 'path';
import { clearCacheTestEnv, createTempDirTracker, setCacheTestEnv } from '../test-utils/test-helpers';

const { createTempDir, cleanupTempDirs } = createTempDirTracker();

async function countContentBlobs(cacheDir: string): Promise<number> {
  const contentRoot = path.join(cacheDir, 'content-v2');
  let count = 0;

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  };

  try {
    await walk(contentRoot);
    return count;
  } catch (error) {
    const maybeErrno = error as NodeJS.ErrnoException;
    if (maybeErrno.code === 'ENOENT') {
      return 0;
    }

    throw error;
  }
}

async function loadCacheModule(options?: { cacheEnabled?: boolean; ttlHours?: number; maxSizeMb?: number }) {
  const cacheDir = await createTempDir('cache-utils-');
  const tempDir = await createTempDir('cache-utils-temp-');

  vi.resetModules();
  vi.clearAllMocks();

  setCacheTestEnv({
    tempDir,
    cacheDir,
    cacheEnabled: options?.cacheEnabled,
    ttlHours: options?.ttlHours,
    maxSizeMb: options?.maxSizeMb
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

    const key1 = computeCacheKey(input, 'audio:mp3', 'mp3', params);
    const key2 = computeCacheKey(input, 'audio:mp3', 'mp3', params);

    expect(key1).toBe(key2);
  });

  it('should generate different keys for different params and job types', async () => {
    const { computeCacheKey } = await loadCacheModule();
    const input = Buffer.from('same-input');

    const keyA = computeCacheKey(input, 'audio:mp3', 'mp3', { quality: 2 });
    const keyB = computeCacheKey(input, 'audio:mp3', 'mp3', { quality: 7 });
    const keyC = computeCacheKey(input, 'video:mp4', 'mp4', { quality: 2 });

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it('should generate different keys for different input bytes', async () => {
    const { computeCacheKey } = await loadCacheModule();
    const params = { quality: 2, mode: 'fit' };

    const keyA = computeCacheKey(Buffer.from('input-a'), 'audio:mp3', 'mp3', params);
    const keyB = computeCacheKey(Buffer.from('input-b'), 'audio:mp3', 'mp3', params);

    expect(keyA).not.toBe(keyB);
  });

  it('should generate different keys for different output extensions', async () => {
    const { computeCacheKey } = await loadCacheModule();
    const input = Buffer.from('same-input');
    const params = { quality: 2, mode: 'fit' };

    const keyA = computeCacheKey(input, 'audio:mp3', 'mp3', params);
    const keyB = computeCacheKey(input, 'audio:mp3', 'wav', params);

    expect(keyA).not.toBe(keyB);
  });

  it('should ignore runtime-only path keys in operation signature', async () => {
    const { computeCacheKey } = await loadCacheModule();
    const input = Buffer.from('same-input');

    const keyA = computeCacheKey(input, 'audio:mp3', 'mp3', {
      inputPath: '/tmp/input-a',
      outputPath: '/tmp/output-a',
      outputDir: '/tmp/frames-a',
      jobDir: '/tmp/job-a',
      uploadToS3: true,
      quality: 2,
      nested: {
        outputPath: '/tmp/nested-a',
        mode: 'fit'
      }
    });

    const keyB = computeCacheKey(input, 'audio:mp3', 'mp3', {
      inputPath: '/tmp/input-b',
      outputPath: '/tmp/output-b',
      outputDir: '/tmp/frames-b',
      jobDir: '/tmp/job-b',
      uploadToS3: false,
      quality: 2,
      nested: {
        outputPath: '/tmp/nested-b',
        mode: 'fit'
      }
    });

    expect(keyA).toBe(keyB);
  });

  it('should be deterministic across different object key orders', async () => {
    const { computeCacheKey } = await loadCacheModule();
    const input = Buffer.from('same-input');

    const keyA = computeCacheKey(input, 'audio:mp3', 'mp3', {
      quality: 2,
      mode: 'fit',
      nested: { x: 1, y: 2 }
    });

    const keyB = computeCacheKey(input, 'audio:mp3', 'mp3', {
      mode: 'fit',
      nested: { y: 2, x: 1 },
      quality: 2
    });

    expect(keyA).toBe(keyB);
  });

  it('should round-trip cached output', async () => {
    const { initCacheDir, putCachedOutput, getCachedOutput } = await loadCacheModule();
    await initCacheDir();

    const key = 'roundtrip-key';
    const output = Buffer.from('converted-output');
    await putCachedOutput(key, output, { codec: 'mp3' });

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

    await putCachedOutput(keyOld, payload);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await putCachedOutput(keyNew, payload);

    const oldEntry = await getCachedOutput(keyOld);
    const newEntry = await getCachedOutput(keyNew);

    expect(oldEntry).toBeNull();
    expect(newEntry).not.toBeNull();
  });

  it('should garbage collect unreferenced content after eviction', async () => {
    const { initCacheDir, putCachedOutput, cacheDir } = await loadCacheModule({ maxSizeMb: 1 });
    await initCacheDir();

    await putCachedOutput('entry-a', Buffer.alloc(700 * 1024, 1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await putCachedOutput('entry-b', Buffer.alloc(700 * 1024, 2));

    const contentBlobs = await countContentBlobs(cacheDir);
    expect(contentBlobs).toBe(1);
  });

  it('should no-op when cache is disabled', async () => {
    const { putCachedOutput, getCachedOutput } = await loadCacheModule({ cacheEnabled: false });
    await putCachedOutput('disabled-key', Buffer.from('data'));

    const cached = await getCachedOutput('disabled-key');
    expect(cached).toBeNull();
  });
});
