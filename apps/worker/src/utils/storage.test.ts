import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import { S3Client, CreateBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import IORedis from 'ioredis';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'storage');
const TEST_BUCKET = 'test-ffmpeg-bucket';

describe('Storage Utility', () => {
  let container: StartedLocalStackContainer;
  let s3Client: S3Client;
  let originalEnv: NodeJS.ProcessEnv;
  let redisClient: IORedis;
  let redisUrlForSuite: string;

  beforeAll(async () => {
    originalEnv = { ...process.env };

    const baseRedisUrl = process.env['TEST_REDIS_URL'] || process.env['REDIS_URL'] || 'redis://localhost:6379';
    const url = new URL(baseRedisUrl);
    url.pathname = '/1';
    url.search = '';
    url.hash = '';
    redisUrlForSuite = url.toString();

    process.env['REDIS_URL'] = redisUrlForSuite;

    redisClient = new IORedis(redisUrlForSuite);

    container = await new LocalstackContainer('localstack/localstack:latest').start();

    const endpoint = container.getConnectionUri();

    s3Client = new S3Client({
      endpoint,
      forcePathStyle: true,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    });

    await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));

    process.env['STORAGE_MODE'] = 's3';
    process.env['S3_ENDPOINT'] = endpoint;
    process.env['S3_REGION'] = 'us-east-1';
    process.env['S3_BUCKET'] = TEST_BUCKET;
    process.env['S3_ACCESS_KEY_ID'] = 'test';
    process.env['S3_SECRET_ACCESS_KEY'] = 'test';
    process.env['S3_PATH_PREFIX'] = 'test-prefix';

    vi.resetModules();

    await mkdir(TEST_DIR, { recursive: true });
  }, 60000);

  beforeEach(async () => {
    process.env['REDIS_URL'] = redisUrlForSuite;
    await redisClient.flushdb();
  });

  afterAll(async () => {
    await redisClient?.quit();
    await container?.stop();

    process.env = originalEnv;
    vi.resetModules();

    if (TEST_DIR) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should upload file to S3 and return URL', async () => {
    const { uploadToS3 } = await import('./storage');

    const testFilePath = path.join(TEST_DIR, 'test-file.txt');
    await writeFile(testFilePath, 'test content');

    const result = await uploadToS3(testFilePath, 'text/plain', 'uploaded-file.txt');

    expect(result.url).toBeDefined();
    expect(result.key).toContain('test-prefix/');
    expect(result.key).toContain('/uploaded-file.txt');

    const headCommand = new HeadObjectCommand({
      Bucket: TEST_BUCKET,
      Key: result.key
    });

    const headResult = await s3Client.send(headCommand);
    expect(headResult.ContentType).toBe('text/plain');
  });

  it('should throw error when S3 mode not enabled', async () => {
    process.env['STORAGE_MODE'] = 'stateless';
    vi.resetModules();
    const { uploadToS3 } = await import('./storage');

    const testFilePath = path.join(TEST_DIR, 'test-file-2.txt');
    await writeFile(testFilePath, 'test content');

    await expect(uploadToS3(testFilePath, 'text/plain', 'file.txt')).rejects.toThrow('S3 mode not enabled');

    process.env['STORAGE_MODE'] = 's3';
    vi.resetModules();
  });

  it('should use custom public URL when provided', async () => {
    process.env['S3_PUBLIC_URL'] = 'https://cdn.example.com';
    vi.resetModules();
    const { uploadToS3 } = await import('./storage');

    const testFilePath = path.join(TEST_DIR, 'test-file-3.txt');
    await writeFile(testFilePath, 'custom public url test content');

    const result = await uploadToS3(testFilePath, 'text/plain', 'custom-url-file.txt');

    expect(result.url).toContain('https://cdn.example.com');
    expect(result.url).toContain(result.key);

    delete process.env['S3_PUBLIC_URL'];
    vi.resetModules();
  });

  describe('hashFile', () => {
    it('should generate consistent SHA-256 hash for same content', async () => {
      const { hashFile } = await import('./storage');

      const testFilePath = path.join(TEST_DIR, 'hash-test-1.txt');
      await writeFile(testFilePath, 'consistent content');

      const hash1 = await hashFile(testFilePath);
      const hash2 = await hashFile(testFilePath);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different content', async () => {
      const { hashFile } = await import('./storage');

      const testFile1 = path.join(TEST_DIR, 'hash-test-2a.txt');
      const testFile2 = path.join(TEST_DIR, 'hash-test-2b.txt');

      await writeFile(testFile1, 'content A');
      await writeFile(testFile2, 'content B');

      const hash1 = await hashFile(testFile1);
      const hash2 = await hashFile(testFile2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('deduplication', () => {
    it('should upload file once and return same URL on duplicate', async () => {
      process.env['S3_DEDUP_ENABLED'] = 'true';
      vi.resetModules();
      const { uploadToS3 } = await import('./storage');

      const testFilePath = path.join(TEST_DIR, 'dedup-test-1.txt');
      await writeFile(testFilePath, 'duplicate content test');

      const result1 = await uploadToS3(testFilePath, 'text/plain', 'dedup-file.txt');
      const result2 = await uploadToS3(testFilePath, 'text/plain', 'dedup-file.txt');

      expect(result1.url).toBe(result2.url);
      expect(result1.key).toBe(result2.key);
    });

    it('should skip S3 upload on cache hit', async () => {
      process.env['S3_DEDUP_ENABLED'] = 'true';
      vi.resetModules();
      const { uploadToS3 } = await import('./storage');

      const testFilePath = path.join(TEST_DIR, 'dedup-test-2.txt');
      await writeFile(testFilePath, 'cache hit test content');

      const result1 = await uploadToS3(testFilePath, 'text/plain', 'cache-test.txt');

      const listObjectsV2 = vi.fn();
      s3Client.send = listObjectsV2;

      const result2 = await uploadToS3(testFilePath, 'text/plain', 'cache-test.txt');

      expect(result1.url).toBe(result2.url);
      expect(listObjectsV2).not.toHaveBeenCalled();
    });

    it('should respect S3_DEDUP_ENABLED flag', async () => {
      await redisClient.flushdb();

      delete process.env['S3_DEDUP_ENABLED'];
      process.env['S3_DEDUP_ENABLED'] = '';
      vi.resetModules();
      const { uploadToS3 } = await import('./storage');

      const testFilePath = path.join(TEST_DIR, 'dedup-test-3.txt');
      await writeFile(testFilePath, 'no dedup test');

      const result1 = await uploadToS3(testFilePath, 'text/plain', 'no-dedup.txt');
      const result2 = await uploadToS3(testFilePath, 'text/plain', 'no-dedup.txt');

      expect(result1.url).not.toBe(result2.url);
      expect(result1.key).not.toBe(result2.key);

      process.env['S3_DEDUP_ENABLED'] = 'true';
      vi.resetModules();
    });
  });
});
