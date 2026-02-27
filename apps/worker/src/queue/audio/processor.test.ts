import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { processAudioToMp3, processAudioToWav } from './processor';
import type { Job } from 'bullmq';
import type { AudioToMp3JobData, AudioToWavJobData } from '@shared/queue/audio/schemas';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import { S3Client, CreateBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'audio');
const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures', 'audio');

describe('processAudioToMp3', () => {
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

  it('should convert WAV to MP3 successfully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-audio.wav');
    const outputPath = path.join(TEST_DIR, 'output.mp3');

    createTestWavFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2
      }
    } as Job<AudioToMp3JobData>;

    const result = await processAudioToMp3(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toContain('mp3');
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.wav');
    const outputPath = path.join(TEST_DIR, 'output.mp3');

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2
      }
    } as Job<AudioToMp3JobData>;

    const result = await processAudioToMp3(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid audio files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid.wav');
    const outputPath = path.join(TEST_DIR, 'output.mp3');

    writeFileSync(inputPath, 'This is not a valid audio file');

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2
      }
    } as Job<AudioToMp3JobData>;

    const result = await processAudioToMp3(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should convert WAV to MP3 with custom quality', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-audio-quality.wav');
    const outputPath = path.join(TEST_DIR, 'output-quality7.mp3');

    createTestWavFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 7
      }
    } as Job<AudioToMp3JobData>;

    const result = await processAudioToMp3(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toContain('mp3');
  });
});

function createTestWavFile(outputPath: string): void {
  execSync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=1" -ar 44100 -ac 2 -y "${outputPath}"`, { stdio: 'pipe' });
}

function createTestMp3File(outputPath: string, channels = 2): void {
  execSync(
    `ffmpeg -f lavfi -i "sine=frequency=1000:duration=1" -ac ${channels} -codec:a libmp3lame -qscale:a 2 -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

describe('processAudioToWav', () => {
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

  it('should convert MP3 to WAV successfully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-audio.mp3');
    const outputPath = path.join(TEST_DIR, 'output.wav');

    createTestMp3File(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath
      }
    } as Job<AudioToWavJobData>;

    const result = await processAudioToWav(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_format -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.format.format_name).toBe('wav');
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.mp3');
    const outputPath = path.join(TEST_DIR, 'output.wav');

    const job = {
      data: {
        inputPath,
        outputPath
      }
    } as Job<AudioToWavJobData>;

    const result = await processAudioToWav(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid audio files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid.mp3');
    const outputPath = path.join(TEST_DIR, 'output.wav');

    writeFileSync(inputPath, 'This is not a valid audio file');

    const job = {
      data: {
        inputPath,
        outputPath
      }
    } as Job<AudioToWavJobData>;

    const result = await processAudioToWav(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should preserve mono channel when converting mono MP3 to WAV', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-audio-mono.mp3');
    const outputPath = path.join(TEST_DIR, 'output-mono.wav');

    createTestMp3File(inputPath, 1);

    const job = {
      data: {
        inputPath,
        outputPath
      }
    } as Job<AudioToWavJobData>;

    const result = await processAudioToWav(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_streams -select_streams a -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.streams[0].channels).toBe(1);
    expect(metadata.streams[0].codec_name).toBe('pcm_s16le');
  });

  it('should preserve stereo channels when converting stereo MP3 to WAV', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-audio-stereo.mp3');
    const outputPath = path.join(TEST_DIR, 'output-stereo.wav');

    createTestMp3File(inputPath, 2);

    const job = {
      data: {
        inputPath,
        outputPath
      }
    } as Job<AudioToWavJobData>;

    const result = await processAudioToWav(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const fileInfo = execSync(`ffprobe -v error -show_streams -select_streams a -of json "${outputPath}"`).toString();
    const metadata = JSON.parse(fileInfo);
    expect(metadata.streams[0].channels).toBe(2);
    expect(metadata.streams[0].codec_name).toBe('pcm_s16le');
  });
});

const TEST_BUCKET = 'test-ffmpeg-bucket';

describe('Audio Processors - S3 Mode', () => {
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
    process.env['S3_PATH_PREFIX'] = 'test-audio';
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

  it('should upload MP3 to S3 and return URL', async () => {
    const { processAudioToMp3 } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3.wav');
    const outputPath = path.join(TEST_DIR, 'output-s3.mp3');

    createTestWavFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2,
        uploadToS3: true
      }
    } as Job<AudioToMp3JobData>;

    const result = await processAudioToMp3(job);

    expect(result.success).toBe(true);
    expect(result.outputUrl).toBeDefined();
    expect(result.outputPath).toBeUndefined();
    expect(result.outputUrl).toContain('test-audio/');
    expect(result.outputUrl).toContain('/output-s3.mp3');

    expect(existsSync(outputPath)).toBe(false);

    const key = result.outputUrl?.split(`${TEST_BUCKET}/`)[1];
    if (key) {
      const headResult = await s3Client.send(
        new HeadObjectCommand({
          Bucket: TEST_BUCKET,
          Key: key
        })
      );
      expect(headResult.ContentType).toBe('audio/mpeg');
    }
  });

  it('should keep MP3 on local disk when uploadToS3 is false in S3 mode', async () => {
    const { processAudioToMp3 } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3-local.wav');
    const outputPath = path.join(TEST_DIR, 'output-s3-local.mp3');

    createTestWavFile(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        quality: 2,
        uploadToS3: false
      }
    } as Job<AudioToMp3JobData>;

    const result = await processAudioToMp3(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(result.outputUrl).toBeUndefined();
    expect(existsSync(outputPath)).toBe(true);
  });

  it('should upload WAV to S3 and return URL', async () => {
    const { processAudioToWav } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3.mp3');
    const outputPath = path.join(TEST_DIR, 'output-s3.wav');

    createTestMp3File(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        uploadToS3: true
      }
    } as Job<AudioToWavJobData>;

    const result = await processAudioToWav(job);

    expect(result.success).toBe(true);
    expect(result.outputUrl).toBeDefined();
    expect(result.outputPath).toBeUndefined();
    expect(result.outputUrl).toContain('test-audio/');
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

  it('should keep WAV on local disk when uploadToS3 is false in S3 mode', async () => {
    const { processAudioToWav } = await import('./processor');

    const inputPath = path.join(FIXTURES_DIR, 'test-s3-local.mp3');
    const outputPath = path.join(TEST_DIR, 'output-s3-local.wav');

    createTestMp3File(inputPath);

    const job = {
      data: {
        inputPath,
        outputPath,
        uploadToS3: false
      }
    } as Job<AudioToWavJobData>;

    const result = await processAudioToWav(job);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(result.outputUrl).toBeUndefined();
    expect(existsSync(outputPath)).toBe(true);
  });
});
