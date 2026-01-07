import type { Job } from 'bullmq';
import type { JobResult } from '..';
import type { ImageToJpgJobData, ImageResizeJobData, ResizeMode } from './schemas';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { dirname, basename, extname } from 'path';
import { env } from '~/config/env';
import { logger } from '~/config/logger';
import { uploadToS3 } from '~/utils/storage';
import { getMimeType } from '~/utils/mime-types';

const execFileAsync = promisify(execFile);

const PROCESSING_TIMEOUT = 600000;

export async function processImageToJpg(job: Job<ImageToJpgJobData>): Promise<JobResult> {
  const { inputPath, outputPath, quality } = job.data;
  logger.info({ jobId: job.id, inputPath, outputPath }, 'Starting image conversion');

  if (!existsSync(inputPath)) {
    logger.error({ jobId: job.id, inputPath }, 'Input file does not exist');
    return {
      success: false,
      error: `Input file does not exist: ${inputPath}`
    };
  }

  try {
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });

    const ffmpegStart = Date.now();
    await execFileAsync('ffmpeg', ['-i', inputPath, '-q:v', quality.toString(), '-y', outputPath], {
      timeout: PROCESSING_TIMEOUT
    });
    const ffmpegDuration = Date.now() - ffmpegStart;
    logger.info({ jobId: job.id, duration: ffmpegDuration }, 'FFmpeg conversion completed');

    if (env.STORAGE_MODE === 's3') {
      const uploadStart = Date.now();
      const { url } = await uploadToS3(outputPath, 'image/jpeg', basename(outputPath));
      const uploadDuration = Date.now() - uploadStart;
      logger.info({ jobId: job.id, duration: uploadDuration, url }, 'S3 upload completed');
      await rm(outputPath, { force: true });
      return {
        success: true,
        outputUrl: url
      };
    }

    logger.info({ jobId: job.id }, 'Conversion successful');
    return {
      success: true,
      outputPath
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ jobId: job.id, error: errorMessage }, 'Conversion failed');
    return {
      success: false,
      error: `Failed to convert image to JPG: ${errorMessage}`
    };
  }
}

function buildResizeFilter(width: number | undefined, height: number | undefined, mode: ResizeMode): string {
  const w = width ?? -2;
  const h = height ?? -2;

  switch (mode) {
    case 'fit':
      return `scale=${w}:${h}:force_original_aspect_ratio=decrease`;
    case 'fill':
      if (!width || !height) {
        throw new Error('Fill mode requires both width and height');
      }
      return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    case 'force':
      return `scale=${w}:${h}`;
    default:
      throw new Error(`Unknown resize mode: ${mode}`);
  }
}

export async function processImageResize(job: Job<ImageResizeJobData>): Promise<JobResult> {
  const { inputPath, outputPath, width, height, mode } = job.data;
  logger.info({ jobId: job.id, inputPath, outputPath, width, height, mode }, 'Starting image resize');

  if (!width && !height) {
    logger.error({ jobId: job.id }, 'At least one of width or height must be specified');
    return {
      success: false,
      error: 'At least one of width or height must be specified'
    };
  }

  if (!existsSync(inputPath)) {
    logger.error({ jobId: job.id, inputPath }, 'Input file does not exist');
    return {
      success: false,
      error: `Input file does not exist: ${inputPath}`
    };
  }

  try {
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });

    const filter = buildResizeFilter(width, height, mode);
    const ffmpegStart = Date.now();
    await execFileAsync('ffmpeg', ['-i', inputPath, '-vf', filter, '-y', outputPath], {
      timeout: PROCESSING_TIMEOUT
    });
    const ffmpegDuration = Date.now() - ffmpegStart;
    logger.info({ jobId: job.id, duration: ffmpegDuration, filter }, 'FFmpeg resize completed');

    if (env.STORAGE_MODE === 's3') {
      const ext = extname(outputPath);
      const mimeType = getMimeType(ext);
      const uploadStart = Date.now();
      const { url } = await uploadToS3(outputPath, mimeType, basename(outputPath));
      const uploadDuration = Date.now() - uploadStart;
      logger.info({ jobId: job.id, duration: uploadDuration, url }, 'S3 upload completed');
      await rm(outputPath, { force: true });
      return {
        success: true,
        outputUrl: url
      };
    }

    logger.info({ jobId: job.id }, 'Resize successful');
    return {
      success: true,
      outputPath
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ jobId: job.id, error: errorMessage }, 'Resize failed');
    return {
      success: false,
      error: `Failed to resize image: ${errorMessage}`
    };
  }
}
