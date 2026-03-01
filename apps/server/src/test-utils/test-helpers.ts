import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

interface CacheTestEnvOptions {
  cacheDir: string;
  tempDir: string;
  cacheEnabled?: boolean;
  ttlHours?: number;
  maxSizeMb?: number;
  sweepIntervalMinutes?: number;
}

export function createTempDirTracker() {
  const createdDirs: string[] = [];

  return {
    async createTempDir(prefix: string): Promise<string> {
      const dir = await mkdtemp(path.join(tmpdir(), prefix));
      createdDirs.push(dir);
      return dir;
    },
    async cleanupTempDirs(): Promise<void> {
      await Promise.all(
        createdDirs.splice(0, createdDirs.length).map((dir) =>
          rm(dir, {
            recursive: true,
            force: true
          })
        )
      );
    }
  };
}

export function setCacheTestEnv(options: CacheTestEnvOptions): void {
  process.env['NODE_ENV'] = 'test';
  process.env['TEMP_DIR'] = options.tempDir;
  process.env['CACHE_ENABLED'] = options.cacheEnabled === false ? 'false' : 'true';
  process.env['CACHE_DIR'] = options.cacheDir;
  process.env['CACHE_TTL_HOURS'] = String(options.ttlHours ?? 24);
  process.env['CACHE_MAX_SIZE_MB'] = String(options.maxSizeMb ?? 10);
  process.env['CACHE_SWEEP_INTERVAL_MINUTES'] = String(options.sweepIntervalMinutes ?? 60);
}

export function clearCacheTestEnv(): void {
  delete process.env['CACHE_ENABLED'];
  delete process.env['CACHE_DIR'];
  delete process.env['CACHE_TTL_HOURS'];
  delete process.env['CACHE_MAX_SIZE_MB'];
  delete process.env['CACHE_SWEEP_INTERVAL_MINUTES'];
  delete process.env['TEMP_DIR'];
}
