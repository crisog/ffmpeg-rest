import { serve } from '@hono/node-server';
import { createApp } from '~/app';
import { env } from '~/config/env';
import { checkRedisHealth } from '~/config/redis';
import { logger } from '~/config/logger';
import { initCacheDir, startCacheCleanup } from '~/utils/cache';

await checkRedisHealth();

let stopCacheCleanup: () => void = () => undefined;
if (env.CACHE_ENABLED) {
  await initCacheDir();
  stopCacheCleanup = startCacheCleanup();
}

const handleShutdown = (signal: NodeJS.Signals) => {
  logger.info({ signal }, 'Shutting down server');
  stopCacheCleanup();
  process.exit(0);
};

process.once('SIGINT', () => handleShutdown('SIGINT'));
process.once('SIGTERM', () => handleShutdown('SIGTERM'));

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    logger.info('🚀 FFmpeg REST API started');
    logger.info({ port: info.port, storageMode: env.STORAGE_MODE }, 'Server info');
    logger.info(`📚 OpenAPI Spec: http://localhost:${info.port}/doc`);
    logger.info(`📖 API Reference: http://localhost:${info.port}/reference`);
    logger.info(`🤖 LLM Documentation: http://localhost:${info.port}/llms.txt`);
  }
);
