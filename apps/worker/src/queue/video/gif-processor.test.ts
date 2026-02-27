import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { processVideoToGif } from './gif-processor';
import type { Job } from 'bullmq';
import type { VideoToGifJobData } from '@shared/queue/video/gif-schemas';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import { S3Client, CreateBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'video-gif');
const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures', 'video-gif');

function createTestAviFile(outputPath: string): void {
  execSync(
    `ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -f lavfi -i sine=frequency=1000:duration=2:sample_rate=44100 -ac 2 -pix_fmt yuv420p -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

describe('processVideoToGif', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!existsSync(FIXTURES_DIR)) {
      mkdirSync(FIXTURES_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (existsSync(FIXTURES_DIR)) {
      rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
  });

  it('should convert AVI to GIF successfully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video.avi');
    const outputPath = path.join(TEST_DIR, 'output.gif');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        fps: 10
      }
    } as Job<VideoToGifJobData>;

    const result = await processVideoToGif(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toBe('gif');
  });

  it('should respect fps parameter', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-fps.avi');
    const outputPath = path.join(TEST_DIR, 'output-fps.gif');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        fps: 5
      }
    } as Job<VideoToGifJobData>;

    const result = await processVideoToGif(job);

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`
    ).toString();
    const parts = fileInfo.trim().split('/').map(Number);
    const fps = (parts[0] ?? 0) / (parts[1] ?? 1);
    expect(fps).toBeCloseTo(5, 0);
  });

  it('should respect width parameter', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-width.avi');
    const outputPath = path.join(TEST_DIR, 'output-width.gif');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        fps: 10,
        width: 160
      }
    } as Job<VideoToGifJobData>;

    const result = await processVideoToGif(job);

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${outputPath}"`
    ).toString();
    const data = JSON.parse(fileInfo);
    expect(data.streams[0].width).toBe(160);
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.avi');
    const outputPath = path.join(TEST_DIR, 'output.gif');

    const job = {
      data: {
        inputPath,
        outputPath,
        fps: 10
      }
    } as Job<VideoToGifJobData>;

    const result = await processVideoToGif(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid video files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid.avi');
    const outputPath = path.join(TEST_DIR, 'output.gif');

    writeFileSync(inputPath, 'This is not a valid video file');

    const job = {
      data: {
        inputPath,
        outputPath,
        fps: 10
      }
    } as Job<VideoToGifJobData>;

    const result = await processVideoToGif(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

const TEST_BUCKET = 'test-ffmpeg-bucket';

describe('processVideoToGif - S3 Mode', () => {
  let container: StartedLocalStackContainer;
  let s3Client: S3Client;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };

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
    process.env['S3_PATH_PREFIX'] = 'test-video-gif';
    process.env['S3_DEDUP_ENABLED'] = 'false';

    vi.resetModules();
  }, 60000);

  afterAll(async () => {
    await container?.stop();
    process.env = originalEnv;
    vi.resetModules();
    if (existsSync(FIXTURES_DIR)) {
      rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!existsSync(FIXTURES_DIR)) {
      mkdirSync(FIXTURES_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should upload GIF to S3 and return URL', async () => {
    const { processVideoToGif } = await import('./gif-processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3.avi');
    const outputPath = path.join(TEST_DIR, 'output-s3.gif');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        fps: 10,
        uploadToS3: true
      }
    } as Job<VideoToGifJobData>;

    const result = await processVideoToGif(job);

    expect(result.success).toBe(true);
    expect(result.outputUrl).toBeDefined();
    expect(result.outputPath).toBeUndefined();
    expect(result.outputUrl).toContain('test-video-gif/');
    expect(result.outputUrl).toContain('/output-s3.gif');

    expect(existsSync(outputPath)).toBe(false);

    const key = result.outputUrl?.split(`${TEST_BUCKET}/`)[1];
    if (key) {
      const headResult = await s3Client.send(
        new HeadObjectCommand({
          Bucket: TEST_BUCKET,
          Key: key
        })
      );
      expect(headResult.ContentType).toBe('image/gif');
    }
  });

  it('should keep GIF on local disk when uploadToS3 is false in S3 mode', async () => {
    const { processVideoToGif } = await import('./gif-processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3-local.avi');
    const outputPath = path.join(TEST_DIR, 'output-s3-local.gif');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        fps: 10,
        uploadToS3: false
      }
    } as Job<VideoToGifJobData>;

    const result = await processVideoToGif(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(result.outputUrl).toBeUndefined();
    expect(existsSync(outputPath)).toBe(true);
  });
});
