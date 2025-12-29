import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { processImageToJpg, processImageResize } from './processor';
import type { Job } from 'bullmq';
import type { ImageToJpgJobData, ImageResizeJobData } from './schemas';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import { S3Client, CreateBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'image');
const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures', 'image');

describe('processImageToJpg', () => {
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

  it('should convert PNG to JPG successfully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-image.png');
    const outputPath = path.join(TEST_DIR, 'output.jpg');

    createTestPngFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2
      }
    } as Job<ImageToJpgJobData>;

    const result = await processImageToJpg(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toContain('image2');
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.png');
    const outputPath = path.join(TEST_DIR, 'output.jpg');

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2
      }
    } as Job<ImageToJpgJobData>;

    const result = await processImageToJpg(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid image files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid.png');
    const outputPath = path.join(TEST_DIR, 'output.jpg');

    writeFileSync(inputPath, 'This is not a valid image file');

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2
      }
    } as Job<ImageToJpgJobData>;

    const result = await processImageToJpg(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should convert PNG to JPG with custom quality', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-image-quality.png');
    const outputPath = path.join(TEST_DIR, 'output-quality10.jpg');

    createTestPngFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 10
      }
    } as Job<ImageToJpgJobData>;

    const result = await processImageToJpg(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
  });
});

function createTestPngFile(outputPath: string, width = 320, height = 240): void {
  execSync(`ffmpeg -f lavfi -i testsrc=duration=1:size=${width}x${height}:rate=1 -frames:v 1 -y "${outputPath}"`, {
    stdio: 'pipe'
  });
}

function getImageDimensions(filePath: string): { width: number; height: number } {
  const output = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${filePath}"`
  ).toString();
  const data = JSON.parse(output);
  return {
    width: data.streams[0].width,
    height: data.streams[0].height
  };
}

describe('processImageResize', () => {
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

  it('should resize image with width only (fit mode)', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'resize-width.png');
    const outputPath = path.join(TEST_DIR, 'resized-width.png');

    createTestPngFile(inputPath, 640, 480);

    const job = {
      data: {
        inputPath,
        outputPath,
        width: 320,
        mode: 'fit'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const dimensions = getImageDimensions(outputPath);
    expect(dimensions.width).toBe(320);
    expect(dimensions.height).toBe(240);
  });

  it('should resize image with height only (fit mode)', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'resize-height.png');
    const outputPath = path.join(TEST_DIR, 'resized-height.png');

    createTestPngFile(inputPath, 640, 480);

    const job = {
      data: {
        inputPath,
        outputPath,
        height: 240,
        mode: 'fit'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);

    const dimensions = getImageDimensions(outputPath);
    expect(dimensions.width).toBe(320);
    expect(dimensions.height).toBe(240);
  });

  it('should resize image with both dimensions (force mode)', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'resize-force.png');
    const outputPath = path.join(TEST_DIR, 'resized-force.png');

    createTestPngFile(inputPath, 640, 480);

    const job = {
      data: {
        inputPath,
        outputPath,
        width: 200,
        height: 200,
        mode: 'force'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);

    const dimensions = getImageDimensions(outputPath);
    expect(dimensions.width).toBe(200);
    expect(dimensions.height).toBe(200);
  });

  it('should resize image with fill mode (crop overflow)', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'resize-fill.png');
    const outputPath = path.join(TEST_DIR, 'resized-fill.png');

    createTestPngFile(inputPath, 640, 480);

    const job = {
      data: {
        inputPath,
        outputPath,
        width: 200,
        height: 200,
        mode: 'fill'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);

    const dimensions = getImageDimensions(outputPath);
    expect(dimensions.width).toBe(200);
    expect(dimensions.height).toBe(200);
  });

  it('should return error when neither width nor height specified', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'resize-nodims.png');
    const outputPath = path.join(TEST_DIR, 'resized-nodims.png');

    createTestPngFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        mode: 'fit'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain('width or height');
  });

  it('should return error for fill mode with only width', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'resize-fill-width-only.png');
    const outputPath = path.join(TEST_DIR, 'resized-fill-width-only.png');

    createTestPngFile(inputPath, 640, 480);

    const job = {
      data: {
        inputPath,
        outputPath,
        width: 200,
        mode: 'fill'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Fill mode requires both width and height');
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent-resize.png');
    const outputPath = path.join(TEST_DIR, 'resized.png');

    const job = {
      data: {
        inputPath,
        outputPath,
        width: 100,
        mode: 'fit'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid image files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid-resize.png');
    const outputPath = path.join(TEST_DIR, 'resized-invalid.png');

    writeFileSync(inputPath, 'This is not a valid image file');

    const job = {
      data: {
        inputPath,
        outputPath,
        width: 100,
        mode: 'fit'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should preserve image format (PNG to PNG)', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'resize-format.png');
    const outputPath = path.join(TEST_DIR, 'resized-format.png');

    createTestPngFile(inputPath, 640, 480);

    const job = {
      data: {
        inputPath,
        outputPath,
        width: 320,
        mode: 'fit'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toContain('png');
  });
});

const TEST_BUCKET = 'test-ffmpeg-bucket';

describe('Image Processors - S3 Mode', () => {
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
    process.env['S3_PATH_PREFIX'] = 'test-image';
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

  it('should upload JPG to S3 and return URL', async () => {
    const { processImageToJpg } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3.png');
    const outputPath = path.join(TEST_DIR, 'output-s3.jpg');

    createTestPngFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2
      }
    } as Job<ImageToJpgJobData>;

    const result = await processImageToJpg(job);

    expect(result.success).toBe(true);
    expect(result.outputUrl).toBeDefined();
    expect(result.outputPath).toBeUndefined();
    expect(result.outputUrl).toContain('test-image/');
    expect(result.outputUrl).toContain('/output-s3.jpg');

    expect(existsSync(outputPath)).toBe(false);

    const key = result.outputUrl?.split(`${TEST_BUCKET}/`)[1];
    if (key) {
      const headResult = await s3Client.send(
        new HeadObjectCommand({
          Bucket: TEST_BUCKET,
          Key: key
        })
      );
      expect(headResult.ContentType).toBe('image/jpeg');
    }
  });

  it('should upload resized image to S3 and return URL', async () => {
    const { processImageResize } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-resize-s3.png');
    const outputPath = path.join(TEST_DIR, 'resized-s3.png');

    createTestPngFile(inputPath, 640, 480);

    const job = {
      data: {
        inputPath,
        outputPath,
        width: 320,
        mode: 'fit'
      }
    } as Job<ImageResizeJobData>;

    const result = await processImageResize(job);

    expect(result.success).toBe(true);
    expect(result.outputUrl).toBeDefined();
    expect(result.outputPath).toBeUndefined();
    expect(result.outputUrl).toContain('test-image/');
    expect(result.outputUrl).toContain('/resized-s3.png');

    expect(existsSync(outputPath)).toBe(false);

    const key = result.outputUrl?.split(`${TEST_BUCKET}/`)[1];
    if (key) {
      const headResult = await s3Client.send(
        new HeadObjectCommand({
          Bucket: TEST_BUCKET,
          Key: key
        })
      );
      expect(headResult.ContentType).toBe('image/png');
    }
  });
});
