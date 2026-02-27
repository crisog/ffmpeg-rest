import { z } from 'zod';

if (process.env['NODE_ENV'] !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  TEMP_DIR: z.string().default('/tmp/ffmpeg-rest'),
  MAX_FILE_SIZE: z.coerce.number().default(100 * 1024 * 1024),

  STORAGE_MODE: z.enum(['stateless', 's3']).default('stateless'),

  AUTH_TOKEN: z.string().optional()
});

export const env = schema.parse(process.env);
