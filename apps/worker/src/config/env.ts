import { z } from 'zod';

if (process.env['NODE_ENV'] !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().default(5),

  STORAGE_MODE: z.enum(['stateless', 's3']).default('stateless'),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  S3_PATH_PREFIX: z.string().default('ffmpeg-rest'),
  S3_DEDUP_ENABLED: z.coerce.boolean().default(true),
  S3_DEDUP_TTL_DAYS: z.coerce.number().default(90)
});

export const env = schema.parse(process.env);
