import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { readFile, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { z } from 'zod';
import { env } from '@worker/config/env';
import { logger } from '@worker/config/logger';
import { randomUUID } from 'crypto';
import { connection as redisConnection } from '@worker/config/redis';

export const UploadResultSchema = z.object({
  url: z.url(),
  key: z.string().min(1)
});

export type UploadResult = z.infer<typeof UploadResultSchema>;

const CachedUploadSchema = z.object({
  url: z.url(),
  key: z.string().min(1),
  contentType: z.string().min(1),
  uploadedAt: z.number().positive(),
  fileSize: z.number().nonnegative()
});

type CachedUpload = z.infer<typeof CachedUploadSchema>;

export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function getCachedUpload(hash: string): Promise<UploadResult | null> {
  if (!env.S3_DEDUP_ENABLED) {
    return null;
  }

  try {
    const cacheKey = `s3-dedup:${hash}`;
    const cached = await redisConnection.get(cacheKey);

    if (!cached) {
      return null;
    }

    const data = CachedUploadSchema.parse(JSON.parse(cached));
    logger.info({ hash, url: data.url }, 'Cache hit for file upload');

    return {
      url: data.url,
      key: data.key
    };
  } catch (error) {
    logger.error({ error, hash }, 'Failed to get cached upload or validation failed');
    return null;
  }
}

async function cacheUpload(hash: string, result: UploadResult, contentType: string, fileSize: number): Promise<void> {
  if (!env.S3_DEDUP_ENABLED) {
    return;
  }

  try {
    const cacheKey = `s3-dedup:${hash}`;
    const data: CachedUpload = {
      url: result.url,
      key: result.key,
      contentType,
      uploadedAt: Date.now(),
      fileSize
    };

    const ttlSeconds = env.S3_DEDUP_TTL_DAYS * 24 * 60 * 60;
    await redisConnection.setex(cacheKey, ttlSeconds, JSON.stringify(data));

    logger.info({ hash, url: result.url, ttlDays: env.S3_DEDUP_TTL_DAYS }, 'Cached upload result');
  } catch (error) {
    logger.error({ error, hash }, 'Failed to cache upload');
  }
}

export async function checkS3Health(): Promise<void> {
  if (env.STORAGE_MODE !== 's3') {
    return;
  }

  if (!env.S3_ENDPOINT || !env.S3_REGION || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3 mode enabled but configuration is incomplete');
  }

  const s3Client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    }
  });

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    logger.info('✅ S3 health check passed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ S3 health check failed: ${errorMessage}`);
    throw new Error(`S3 health check failed: ${errorMessage}`);
  }
}

export async function uploadToS3(
  filePath: string,
  contentType: string,
  originalFilename: string
): Promise<UploadResult> {
  if (env.STORAGE_MODE !== 's3') {
    throw new Error('S3 mode not enabled');
  }

  if (!env.S3_ENDPOINT || !env.S3_REGION || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3 configuration missing');
  }

  const fileHash = await hashFile(filePath);
  const cachedResult = await getCachedUpload(fileHash);

  if (cachedResult) {
    return cachedResult;
  }

  const s3Client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    }
  });

  const timestamp = new Date().toISOString().split('T')[0];
  const uuid = randomUUID();
  const key = `${env.S3_PATH_PREFIX}/${timestamp}-${uuid}/${originalFilename}`;

  const fileBuffer = await readFile(filePath);
  const fileStats = await stat(filePath);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: 'public-read'
    })
  );

  const url = env.S3_PUBLIC_URL ? `${env.S3_PUBLIC_URL}/${key}` : `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

  const result: UploadResult = { url, key };

  await cacheUpload(fileHash, result, contentType, fileStats.size);

  return result;
}
