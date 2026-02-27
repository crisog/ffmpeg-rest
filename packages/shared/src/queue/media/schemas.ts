import { z } from 'zod';

export const MediaProbeJobDataSchema = z.object({
  inputPath: z.string()
});

export type MediaProbeJobData = z.infer<typeof MediaProbeJobDataSchema>;
