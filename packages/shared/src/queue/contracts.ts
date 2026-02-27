import { z } from 'zod';

export const JobType = {
  AUDIO_TO_MP3: 'audio:mp3',
  AUDIO_TO_WAV: 'audio:wav',
  VIDEO_TO_MP4: 'video:mp4',
  VIDEO_EXTRACT_AUDIO: 'video:audio',
  VIDEO_EXTRACT_FRAMES: 'video:frames',
  IMAGE_TO_JPG: 'image:jpg',
  VIDEO_TO_GIF: 'video:gif',
  IMAGE_RESIZE: 'image:resize',
  MEDIA_PROBE: 'media:info'
} as const;

export type JobTypeName = (typeof JobType)[keyof typeof JobType];

export const JobResultSchema = z.object({
  success: z.boolean(),
  outputPath: z.string().optional(),
  outputPaths: z.array(z.string()).optional(),
  outputUrl: z.url().optional(),
  outputUrls: z.array(z.url()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional()
});

export type JobResult = z.infer<typeof JobResultSchema>;

export const QUEUE_NAME = 'ffmpeg-jobs';
