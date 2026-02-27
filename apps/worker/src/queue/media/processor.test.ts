import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { processMediaProbe } from './processor';
import type { Job } from 'bullmq';
import type { MediaProbeJobData } from '@shared/queue/media/schemas';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'media');
const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures', 'media');

describe('processMediaProbe', () => {
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

  it('should probe video file and return metadata', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-video-probe.avi');

    createTestVideoFile(inputPath);

    const job = {
      data: {
        inputPath
      }
    } as Job<MediaProbeJobData>;

    const result = await processMediaProbe(job);

    expect(result.success).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.['format']).toBeDefined();
    expect(result.metadata?.['streams']).toBeDefined();
    expect(Array.isArray(result.metadata?.['streams'])).toBe(true);
  });

  it('should probe audio file and return metadata', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'test-audio-probe.mp3');

    createTestAudioFile(inputPath);

    const job = {
      data: {
        inputPath
      }
    } as Job<MediaProbeJobData>;

    const result = await processMediaProbe(job);

    expect(result.success).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.['format']).toBeDefined();

    const metadata = result.metadata as Record<string, unknown>;
    const format = metadata?.['format'] as Record<string, unknown>;
    expect(format?.['format_name']).toContain('mp3');
  });

  it('should return error when input file does not exist', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'non-existent.mp4');

    const job = {
      data: {
        inputPath
      }
    } as Job<MediaProbeJobData>;

    const result = await processMediaProbe(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('should handle invalid media files gracefully', async () => {
    const inputPath = path.join(FIXTURES_DIR, 'invalid-media.mp4');

    writeFileSync(inputPath, 'This is not a valid media file');

    const job = {
      data: {
        inputPath
      }
    } as Job<MediaProbeJobData>;

    const result = await processMediaProbe(job);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

function createTestVideoFile(outputPath: string): void {
  execSync(
    `ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=30 -f lavfi -i sine=frequency=1000:duration=1 -pix_fmt yuv420p -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

function createTestAudioFile(outputPath: string): void {
  execSync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=1" -codec:a libmp3lame -qscale:a 2 -y "${outputPath}"`, {
    stdio: 'pipe'
  });
}
