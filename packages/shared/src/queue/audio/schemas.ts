import { z } from 'zod';

export const AudioToMp3JobDataSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  quality: z.number().min(0).max(9).default(2),
  uploadToS3: z.boolean().default(false)
});

export const AudioToWavJobDataSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  uploadToS3: z.boolean().default(false)
});

export type AudioToMp3JobData = z.infer<typeof AudioToMp3JobDataSchema>;
export type AudioToWavJobData = z.infer<typeof AudioToWavJobDataSchema>;
