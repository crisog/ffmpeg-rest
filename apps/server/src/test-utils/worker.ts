import { Worker } from 'bullmq';
import { connection } from '~/config/redis';
import { QUEUE_NAME, JobType } from '~/queue';
import type { JobResult } from '~/queue';

import { processAudioToMp3, processAudioToWav } from '@worker/queue/audio/processor';
import { processVideoToMp4, processVideoExtractAudio, processVideoExtractFrames } from '@worker/queue/video/processor';
import { processVideoToGif } from '@worker/queue/video/gif-processor';
import { processImageToJpg, processImageResize } from '@worker/queue/image/processor';
import { processMediaProbe } from '@worker/queue/media/processor';

export function createTestWorker(): Worker<unknown, JobResult> {
  return new Worker<unknown, JobResult>(
    QUEUE_NAME,
    async (job) => {
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
        case JobType.VIDEO_TO_GIF:
          return processVideoToGif(job as never);
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
    { connection, concurrency: 10 }
  );
}
