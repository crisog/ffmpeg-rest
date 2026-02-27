import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { processVideoToMp4, processVideoExtractAudio, processVideoExtractFrames } from './processor';
import type { Job } from 'bullmq';
import type {
  VideoToMp4JobData,
  VideoExtractAudioJobData,
  VideoExtractFramesJobData
} from '@shared/queue/video/schemas';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import { S3Client, CreateBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'video');
const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures', 'video');

describe('processVideoToMp4', () => {
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

  it('should convert AVI to MP4 successfully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video.avi');
    const outputPath = path.join(TEST_DIR, 'output.mp4');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        crf: 23,
        preset: 'medium' as const,
        smartCopy: true
      }
    } as Job<VideoToMp4JobData>;

    const result = await processVideoToMp4(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toContain('mp4');
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.avi');
    const outputPath = path.join(TEST_DIR, 'output.mp4');

    const job = {
      data: {
        inputPath,
        outputPath,
        crf: 23,
        preset: 'medium' as const,
        smartCopy: true
      }
    } as Job<VideoToMp4JobData>;

    const result = await processVideoToMp4(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid video files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid.avi');
    const outputPath = path.join(TEST_DIR, 'output.mp4');

    writeFileSync(inputPath, 'This is not a valid video file');

    const job = {
      data: {
        inputPath,
        outputPath,
        crf: 23,
        preset: 'medium' as const,
        smartCopy: true
      }
    } as Job<VideoToMp4JobData>;

    const result = await processVideoToMp4(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should convert AVI to MP4 with custom crf and preset', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-custom.avi');
    const outputPath = path.join(TEST_DIR, 'output-fast.mp4');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        crf: 28,
        preset: 'fast' as const,
        smartCopy: true
      }
    } as Job<VideoToMp4JobData>;

    const result = await processVideoToMp4(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toContain('mp4');
  });

  it('should use stream copy for compatible H264+AAC MP4 files', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-h264-aac.mp4');
    const outputPath = path.join(TEST_DIR, 'output-copy.mp4');

    createTestMp4File(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        crf: 23,
        preset: 'medium' as const,
        smartCopy: true
      }
    } as Job<VideoToMp4JobData>;

    const result = await processVideoToMp4(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toContain('mp4');
  });
});

function createTestAviFile(outputPath: string): void {
  execSync(
    `ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -f lavfi -i sine=frequency=1000:duration=2:sample_rate=44100 -ac 2 -pix_fmt yuv420p -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

function createTestMp4File(outputPath: string): void {
  execSync(
    `ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -f lavfi -i sine=frequency=1000:duration=2:sample_rate=44100 -c:v libx264 -c:a aac -pix_fmt yuv420p -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

describe('processVideoExtractFrames', () => {
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

  it('should extract frames at specified fps', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-frames.avi');
    const outputDir = path.join(TEST_DIR, 'frames');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputDir,
        fps: 1,
        format: 'png' as const
      }
    } as Job<VideoExtractFramesJobData>;

    const result = await processVideoExtractFrames(job);

    expect(result.success).toBe(true);
    expect(result.outputPaths).toBeDefined();
    expect(result.outputPaths?.length).toBeGreaterThan(0);
    expect(existsSync(outputDir)).toBe(true);

    const files = readdirSync(outputDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.endsWith('.png'))).toBe(true);
  });

  it('should create compressed zip archive when compress is zip', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-zip.avi');
    const outputDir = path.join(TEST_DIR, 'frames-zip');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputDir,
        fps: 1,
        format: 'png' as const,
        compress: 'zip' as const
      }
    } as Job<VideoExtractFramesJobData>;

    const result = await processVideoExtractFrames(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBeDefined();
    expect(result.outputPath).toContain('.zip');
    if (result.outputPath) {
      expect(existsSync(result.outputPath)).toBe(true);
    }
  });

  it('should create compressed gzip archive when compress is gzip', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-gzip.avi');
    const outputDir = path.join(TEST_DIR, 'frames-gzip');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputDir,
        fps: 1,
        format: 'png' as const,
        compress: 'gzip' as const
      }
    } as Job<VideoExtractFramesJobData>;

    const result = await processVideoExtractFrames(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBeDefined();
    expect(result.outputPath).toContain('.tar.gz');
    if (result.outputPath) {
      expect(existsSync(result.outputPath)).toBe(true);
    }
  });

  it('should extract frames as JPEG with custom quality', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-jpg.avi');
    const outputDir = path.join(TEST_DIR, 'frames-jpg');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputDir,
        fps: 1,
        format: 'jpg' as const,
        quality: 5
      }
    } as Job<VideoExtractFramesJobData>;

    const result = await processVideoExtractFrames(job);

    expect(result.success).toBe(true);
    expect(result.outputPaths).toBeDefined();
    expect(result.outputPaths?.length).toBeGreaterThan(0);
    expect(existsSync(outputDir)).toBe(true);

    const files = readdirSync(outputDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.endsWith('.jpg'))).toBe(true);
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.avi');
    const outputDir = path.join(TEST_DIR, 'frames');

    const job = {
      data: {
        inputPath,
        outputDir,
        fps: 1,
        format: 'png' as const
      }
    } as Job<VideoExtractFramesJobData>;

    const result = await processVideoExtractFrames(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid video files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid-frames.avi');
    const outputDir = path.join(TEST_DIR, 'frames');

    writeFileSync(inputPath, 'This is not a valid video file');

    const job = {
      data: {
        inputPath,
        outputDir,
        fps: 1,
        format: 'png' as const
      }
    } as Job<VideoExtractFramesJobData>;

    const result = await processVideoExtractFrames(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('processVideoExtractAudio', () => {
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

  it('should extract audio as mono by default', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-audio.avi');
    const outputPath = path.join(TEST_DIR, 'audio.wav');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        mono: true
      }
    } as Job<VideoExtractAudioJobData>;

    const result = await processVideoExtractAudio(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_streams -select_streams a -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.streams[0].channels).toBe(1);
    expect(metadata.streams[0].codec_name).toBe('pcm_s16le');
  });

  it('should preserve original channels when mono is false', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-stereo.avi');
    const outputPath = path.join(TEST_DIR, 'audio-stereo.wav');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        mono: false
      }
    } as Job<VideoExtractAudioJobData>;

    const result = await processVideoExtractAudio(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_streams -select_streams a -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.streams[0].channels).toBe(2);
    expect(metadata.streams[0].codec_name).toBe('pcm_s16le');
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.avi');
    const outputPath = path.join(TEST_DIR, 'audio.wav');

    const job = {
      data: {
        inputPath,
        outputPath,
        mono: true
      }
    } as Job<VideoExtractAudioJobData>;

    const result = await processVideoExtractAudio(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid video files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid-video.avi');
    const outputPath = path.join(TEST_DIR, 'audio.wav');

    writeFileSync(inputPath, 'This is not a valid video file');

    const job = {
      data: {
        inputPath,
        outputPath,
        mono: true
      }
    } as Job<VideoExtractAudioJobData>;

    const result = await processVideoExtractAudio(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

const TEST_BUCKET = 'test-ffmpeg-bucket';

describe('Video Processors - S3 Mode', () => {
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
    process.env['S3_PATH_PREFIX'] = 'test-video';
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

  it('should upload MP4 to S3 and return URL', async () => {
    const { processVideoToMp4 } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3.avi');
    const outputPath = path.join(TEST_DIR, 'output-s3.mp4');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        crf: 23,
        preset: 'medium' as const,
        smartCopy: true,
        uploadToS3: true
      }
    } as Job<VideoToMp4JobData>;

    const result = await processVideoToMp4(job);

    expect(result.success).toBe(true);
    expect(result.outputUrl).toBeDefined();
    expect(result.outputPath).toBeUndefined();
    expect(result.outputUrl).toContain('test-video/');
    expect(result.outputUrl).toContain('/output-s3.mp4');

    expect(existsSync(outputPath)).toBe(false);

    const key = result.outputUrl?.split(`${TEST_BUCKET}/`)[1];
    if (key) {
      const headResult = await s3Client.send(
        new HeadObjectCommand({
          Bucket: TEST_BUCKET,
          Key: key
        })
      );
      expect(headResult.ContentType).toBe('video/mp4');
    }
  });

  it('should keep MP4 on local disk when uploadToS3 is false in S3 mode', async () => {
    const { processVideoToMp4 } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3-local.avi');
    const outputPath = path.join(TEST_DIR, 'output-s3-local.mp4');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        crf: 23,
        preset: 'medium' as const,
        smartCopy: true,
        uploadToS3: false
      }
    } as Job<VideoToMp4JobData>;

    const result = await processVideoToMp4(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(result.outputUrl).toBeUndefined();
    expect(existsSync(outputPath)).toBe(true);
  });

  it('should upload extracted audio to S3 and return URL', async () => {
    const { processVideoExtractAudio } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3-audio.avi');
    const outputPath = path.join(TEST_DIR, 'output-s3.wav');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        mono: true,
        uploadToS3: true
      }
    } as Job<VideoExtractAudioJobData>;

    const result = await processVideoExtractAudio(job);

    expect(result.success).toBe(true);
    expect(result.outputUrl).toBeDefined();
    expect(result.outputPath).toBeUndefined();
    expect(result.outputUrl).toContain('test-video/');
    expect(result.outputUrl).toContain('/output-s3.wav');

    expect(existsSync(outputPath)).toBe(false);

    const key = result.outputUrl?.split(`${TEST_BUCKET}/`)[1];
    if (key) {
      const headResult = await s3Client.send(
        new HeadObjectCommand({
          Bucket: TEST_BUCKET,
          Key: key
        })
      );
      expect(headResult.ContentType).toBe('audio/wav');
    }
  });

  it('should keep extracted audio on local disk when uploadToS3 is false in S3 mode', async () => {
    const { processVideoExtractAudio } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3-local-audio.avi');
    const outputPath = path.join(TEST_DIR, 'output-s3-local.wav');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        mono: true,
        uploadToS3: false
      }
    } as Job<VideoExtractAudioJobData>;

    const result = await processVideoExtractAudio(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(result.outputUrl).toBeUndefined();
    expect(existsSync(outputPath)).toBe(true);
  });

  it('should upload extracted frames archive to S3 and return URL', async () => {
    const { processVideoExtractFrames } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3-frames.avi');
    const outputDir = path.join(TEST_DIR, 'frames-s3');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputDir,
        fps: 1,
        format: 'png' as const,
        compress: 'zip' as const,
        uploadToS3: true
      }
    } as Job<VideoExtractFramesJobData>;

    const result = await processVideoExtractFrames(job);

    expect(result.success).toBe(true);
    expect(result.outputUrl).toBeDefined();
    expect(result.outputPath).toBeUndefined();
    expect(result.outputUrl).toContain('test-video/');
    expect(result.outputUrl).toContain('.zip');

    expect(existsSync(`${outputDir}.zip`)).toBe(false);

    const key = result.outputUrl?.split(`${TEST_BUCKET}/`)[1];
    if (key) {
      const headResult = await s3Client.send(
        new HeadObjectCommand({
          Bucket: TEST_BUCKET,
          Key: key
        })
      );
      expect(headResult.ContentType).toBe('application/zip');
    }
  });

  it('should keep extracted frames archive on local disk when uploadToS3 is false in S3 mode', async () => {
    const { processVideoExtractFrames } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3-local-frames.avi');
    const outputDir = path.join(TEST_DIR, 'frames-s3-local');

    createTestAviFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputDir,
        fps: 1,
        format: 'png' as const,
        compress: 'zip' as const,
        uploadToS3: false
      }
    } as Job<VideoExtractFramesJobData>;

    const result = await processVideoExtractFrames(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(`${outputDir}.zip`);
    expect(result.outputUrl).toBeUndefined();
    expect(existsSync(`${outputDir}.zip`)).toBe(true);
  });
});
