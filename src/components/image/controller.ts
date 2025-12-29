import type { OpenAPIHono } from '@hono/zod-openapi';
import { imageToJpgRoute, imageToJpgUrlRoute, imageResizeRoute, imageResizeUrlRoute } from './schemas';
import { JobType } from '~/queue';
import { env } from '~/config/env';
import { processMediaJob, getOutputFilename } from '~/utils/job-handler';

function getExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  if (!match || !match[1]) {
    return 'png';
  }
  return match[1].toLowerCase();
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    tif: 'image/tiff'
  };
  return mimeTypes[ext] ?? 'application/octet-stream';
}

export function registerImageRoutes(app: OpenAPIHono) {
  app.openapi(imageToJpgRoute, async (c) => {
    try {
      const { file } = c.req.valid('form');

      const result = await processMediaJob({
        file,
        jobType: JobType.IMAGE_TO_JPG,
        outputExtension: 'jpg',
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
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${getOutputFilename(file.name, 'jpg')}"`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(imageToJpgUrlRoute, async (c) => {
    try {
      if (env.STORAGE_MODE !== 's3') {
        return c.json({ error: 'S3 mode not enabled' }, 400);
      }

      const { file } = c.req.valid('form');

      const result = await processMediaJob({
        file,
        jobType: JobType.IMAGE_TO_JPG,
        outputExtension: 'jpg',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          quality: 2
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

  app.openapi(imageResizeRoute, async (c) => {
    try {
      const { file } = c.req.valid('form');
      const query = c.req.valid('query');
      const { width, height, mode } = query;

      if (!width && !height) {
        return c.json({ error: 'At least one of width or height must be specified' }, 400);
      }

      if (mode === 'fill' && (!width || !height)) {
        return c.json({ error: 'Fill mode requires both width and height' }, 400);
      }

      const ext = getExtension(file.name);

      const result = await processMediaJob({
        file,
        jobType: JobType.IMAGE_RESIZE,
        outputExtension: ext,
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          width,
          height,
          mode
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputBuffer) {
        return c.json({ error: 'Resize failed' }, 400);
      }

      return c.body(new Uint8Array(result.outputBuffer), 200, {
        'Content-Type': getMimeType(ext),
        'Content-Disposition': `attachment; filename="${file.name}"`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(imageResizeUrlRoute, async (c) => {
    try {
      if (env.STORAGE_MODE !== 's3') {
        return c.json({ error: 'S3 mode not enabled' }, 400);
      }

      const { file } = c.req.valid('form');
      const query = c.req.valid('query');
      const { width, height, mode } = query;

      if (!width && !height) {
        return c.json({ error: 'At least one of width or height must be specified' }, 400);
      }

      if (mode === 'fill' && (!width || !height)) {
        return c.json({ error: 'Fill mode requires both width and height' }, 400);
      }

      const ext = getExtension(file.name);

      const result = await processMediaJob({
        file,
        jobType: JobType.IMAGE_RESIZE,
        outputExtension: ext,
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          width,
          height,
          mode
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputUrl) {
        return c.json({ error: 'Resize failed' }, 400);
      }

      return c.json({ url: result.outputUrl }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });
}
