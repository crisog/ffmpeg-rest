import { z } from 'zod';

export const ImageToJpgJobDataSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  quality: z.number().min(1).max(31).default(2)
});

export type ImageToJpgJobData = z.infer<typeof ImageToJpgJobDataSchema>;

export const ResizeModeSchema = z.enum(['fit', 'fill', 'force']);

export type ResizeMode = z.infer<typeof ResizeModeSchema>;

export const ImageResizeJobDataSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  width: z.number().int().positive().max(8192).optional(),
  height: z.number().int().positive().max(8192).optional(),
  mode: ResizeModeSchema.default('fit')
});

export type ImageResizeJobData = z.infer<typeof ImageResizeJobDataSchema>;
