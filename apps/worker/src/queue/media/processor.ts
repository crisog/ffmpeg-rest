import type { Job } from 'bullmq';
import type { JobResult } from '..';
import type { MediaProbeJobData } from '@shared/queue/media/schemas';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);

const PROCESSING_TIMEOUT = 600000;

export async function processMediaProbe(job: Job<MediaProbeJobData>): Promise<JobResult> {
  const { inputPath } = job.data;

  if (!existsSync(inputPath)) {
    return {
      success: false,
      error: `Input file does not exist: ${inputPath}`
    };
  }

  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath],
      { timeout: PROCESSING_TIMEOUT }
    );

    const metadata = JSON.parse(stdout);

    return {
      success: true,
      metadata
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to probe media file: ${errorMessage}`
    };
  }
}
