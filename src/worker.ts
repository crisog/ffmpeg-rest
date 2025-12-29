import { Worker } from 'bullmq';
import { connection, checkRedisHealth } from '~/config/redis';
import { env } from '~/config/env';
import { logger } from '~/config/logger';
import { QUEUE_NAME, JobType } from '~/queue';
import type { JobResult } from '~/queue';
import { checkS3Health } from '~/utils/storage';

import { processAudioToMp3, processAudioToWav } from '~/queue/audio/processor';
import { processVideoToMp4, processVideoExtractAudio, processVideoExtractFrames } from '~/queue/video/processor';
import { processImageToJpg, processImageResize } from '~/queue/image/processor';
import { processMediaProbe } from '~/queue/media/processor';

await checkRedisHealth();

const worker = new Worker<unknown, JobResult>(
  QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, jobType: job.name }, 'Processing job');

    switch (job.name) {
      case JobType.AUDIO_TO_MP3:
        return processAudioToMp3(job as never);
      case JobType.AUDIO_TO_WAV:
        return processAudioToWav(job as never);
      case JobType.VIDEO_TO_MP4:
        return processVideoToMp4(job as never);
      case JobType.VIDEO_EXTRACT_AUDIO:
        return processVideoExtractAudio(job as never);
      case JobType.VIDEO_EXTRACT_FRAMES:
        return processVideoExtractFrames(job as never);
      case JobType.IMAGE_TO_JPG:
        return processImageToJpg(job as never);
      case JobType.IMAGE_RESIZE:
        return processImageResize(job as never);
      case JobType.MEDIA_PROBE:
        return processMediaProbe(job as never);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed successfully');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
});

worker.on('error', (err) => {
  logger.error({ error: err.message }, 'Worker error');
});

logger.info(`🔄 Worker started processing queue: ${QUEUE_NAME}`);
logger.info(`⚙️  Concurrency: ${env.WORKER_CONCURRENCY}`);
logger.info(`💾 Storage Mode: ${env.STORAGE_MODE.toUpperCase()}`);

if (env.STORAGE_MODE === 's3') {
  logger.info(`   S3 Bucket: ${env.S3_BUCKET}`);
  logger.info(`   S3 Region: ${env.S3_REGION}`);
  logger.info(`   S3 Prefix: ${env.S3_PATH_PREFIX}`);
  await checkS3Health();
}
