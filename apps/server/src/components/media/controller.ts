import type { OpenAPIHono } from '@hono/zod-openapi';
import { probeMediaRoute } from './schemas';
import { addJob, JobType, queueEvents, validateJobResult } from '~/queue';
import { env } from '~/config/env';
import { mkdir, writeFile, rm } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';

export function registerMediaRoutes(app: OpenAPIHono) {
  app.openapi(probeMediaRoute, async (c) => {
    try {
      const { file } = c.req.valid('form');

      const jobId = randomUUID();
      const jobDir = path.join(env.TEMP_DIR, jobId);
      await mkdir(jobDir, { recursive: true });

      const inputPath = path.join(jobDir, 'input');

      const arrayBuffer = await file.arrayBuffer();
      await writeFile(inputPath, Buffer.from(arrayBuffer));

      const job = await addJob(JobType.MEDIA_PROBE, {
        inputPath
      });

      const rawResult = await job.waitUntilFinished(queueEvents);
      const result = validateJobResult(rawResult);

      await rm(jobDir, { recursive: true, force: true });

      if (!result.success || !result.metadata) {
        return c.json({ error: result.error || 'Probe failed' }, 400);
      }

      return c.json(result.metadata as never, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });
}
