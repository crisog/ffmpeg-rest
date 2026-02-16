import type { Job } from 'bullmq';
import type { JobResult } from '..';
import type { VideoToGifJobData } from './gif-schemas';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { dirname, basename } from 'path';
import { uploadToS3 } from '~/utils/storage';

const execFileAsync = promisify(execFile);

const PROCESSING_TIMEOUT = 600000;

function buildFilterGraph(fps: number, width?: number): string {
  const scale = width ? `scale=${width}:-1:flags=lanczos` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos';
  return `fps=${fps},${scale},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
}

export async function processVideoToGif(job: Job<VideoToGifJobData>): Promise<JobResult> {
  const { inputPath, outputPath, fps, width } = job.data;

  if (!existsSync(inputPath)) {
    return { success: false, error: `Input file does not exist: ${inputPath}` };
  }

  try {
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });

    const filterGraph = buildFilterGraph(fps, width);

    // Single-pass GIF encoding using split+palettegen+paletteuse filter chain
    await execFileAsync('ffmpeg', ['-i', inputPath, '-vf', filterGraph, '-loop', '0', '-y', outputPath], {
      timeout: PROCESSING_TIMEOUT
    });

    if (job.data.uploadToS3) {
      const { url } = await uploadToS3(outputPath, 'image/gif', basename(outputPath));
      await rm(outputPath, { force: true });
      return { success: true, outputUrl: url };
    }

    return { success: true, outputPath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to convert video to GIF: ${errorMessage}` };
  }
}
