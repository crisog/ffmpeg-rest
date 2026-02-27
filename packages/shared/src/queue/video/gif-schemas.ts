import { z } from 'zod';

export const VideoToGifJobDataSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  fps: z.number().int().min(1).max(30).default(10),
  width: z.number().int().positive().max(1920).optional(),
  uploadToS3: z.boolean().default(false)
});

export type VideoToGifJobData = z.infer<typeof VideoToGifJobDataSchema>;
