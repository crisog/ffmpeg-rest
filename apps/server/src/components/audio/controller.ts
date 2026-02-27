import type { OpenAPIHono } from '@hono/zod-openapi';
import { audioToMp3Route, audioToMp3UrlRoute, audioToWavRoute, audioToWavUrlRoute } from './schemas';
import { JobType } from '~/queue';
import { env } from '~/config/env';
import { processMediaJob, getOutputFilename } from '~/utils/job-handler';

export function registerAudioRoutes(app: OpenAPIHono) {
  app.openapi(audioToMp3Route, async (c) => {
    try {
      const { file } = c.req.valid('form');

      const result = await processMediaJob({
        file,
        jobType: JobType.AUDIO_TO_MP3,
        outputExtension: 'mp3',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          quality: 2
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputBuffer) {
        return c.json({ error: 'Conversion failed' }, 400);
      }

      return c.body(new Uint8Array(result.outputBuffer), 200, {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${getOutputFilename(file.name, 'mp3')}"`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(audioToWavRoute, async (c) => {
    try {
      const { file } = c.req.valid('form');

      const result = await processMediaJob({
        file,
        jobType: JobType.AUDIO_TO_WAV,
        outputExtension: 'wav',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputBuffer) {
        return c.json({ error: 'Conversion failed' }, 400);
      }

      return c.body(new Uint8Array(result.outputBuffer), 200, {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="${getOutputFilename(file.name, 'wav')}"`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(audioToMp3UrlRoute, async (c) => {
    try {
      if (env.STORAGE_MODE !== 's3') {
        return c.json({ error: 'S3 mode not enabled' }, 400);
      }

      const { file } = c.req.valid('form');

      const result = await processMediaJob({
        file,
        jobType: JobType.AUDIO_TO_MP3,
        outputExtension: 'mp3',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          quality: 2,
          uploadToS3: true
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputUrl) {
        return c.json({ error: 'Conversion failed' }, 400);
      }

      return c.json({ url: result.outputUrl }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(audioToWavUrlRoute, async (c) => {
    try {
      if (env.STORAGE_MODE !== 's3') {
        return c.json({ error: 'S3 mode not enabled' }, 400);
      }

      const { file } = c.req.valid('form');

      const result = await processMediaJob({
        file,
        jobType: JobType.AUDIO_TO_WAV,
        outputExtension: 'wav',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          uploadToS3: true
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputUrl) {
        return c.json({ error: 'Conversion failed' }, 400);
      }

      return c.json({ url: result.outputUrl }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });
}
