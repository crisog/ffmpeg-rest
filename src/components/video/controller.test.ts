import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '~/app';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import { Worker } from 'bullmq';
import { createTestWorker } from '~/test-utils/worker';
import { createTestAviFile } from '~/test-utils/fixtures';
import { getVideoInfo, getAudioChannels, countFilesInZip, getImageDimensions } from '~/test-utils/probes';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'video-controller');
const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures', 'video-controller');

describe('Video Controller', () => {
  const app = createApp();
  let worker: Worker;

  beforeAll(async () => {
    if (!existsSync(FIXTURES_DIR)) {
      mkdirSync(FIXTURES_DIR, { recursive: true });
    }

    worker = createTestWorker();
  });

  afterAll(async () => {
    await worker?.close();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    if (existsSync(FIXTURES_DIR)) {
      rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
  });

  describe('POST /video/mp4', () => {
    it('should convert AVI to MP4', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/video/mp4', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('video/mp4');

      const arrayBuffer = await res.arrayBuffer();
      const videoInfo = getVideoInfo(arrayBuffer, TEST_DIR);
      expect(videoInfo.hasVideo).toBe(true);
      expect(videoInfo.videoCodec).toBe('h264');
    });

    it('should return 400 for invalid file', async () => {
      const formData = new FormData();
      const file = new File(['invalid video data'], 'invalid.avi', { type: 'video/x-msvideo' });
      formData.append('file', file);

      const res = await app.request('/video/mp4', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty('error');
    });

    it('should return 400 for missing file', async () => {
      const formData = new FormData();

      const res = await app.request('/video/mp4', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /video/audio', () => {
    it('should extract audio as mono WAV by default', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-audio.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/video/audio', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/wav');

      const arrayBuffer = await res.arrayBuffer();
      const channels = getAudioChannels(arrayBuffer, TEST_DIR);
      expect(channels).toBe(1);
    });

    it('should extract audio preserving channels when mono=no', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-stereo.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/video/audio?mono=no', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/wav');

      const arrayBuffer = await res.arrayBuffer();
      const channels = getAudioChannels(arrayBuffer, TEST_DIR);
      expect(channels).toBe(2);
    });

    it('should return 400 for invalid file', async () => {
      const formData = new FormData();
      const file = new File(['invalid video data'], 'invalid.avi', { type: 'video/x-msvideo' });
      formData.append('file', file);

      const res = await app.request('/video/audio', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty('error');
    });
  });

  describe('POST /video/frames', () => {
    it('should extract frames as ZIP archive', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-frames.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/video/frames?fps=1&compress=zip', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/zip');

      const arrayBuffer = await res.arrayBuffer();
      const fileCount = countFilesInZip(arrayBuffer, TEST_DIR);
      expect(fileCount).toBeGreaterThan(0);
    });

    it('should extract frames as GZIP archive', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-frames-gzip.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/video/frames?fps=1&compress=gzip', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/gzip');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    it('should return 400 when compress parameter is missing', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-no-compress.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/video/frames?fps=1', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty('error');
      expect(json.error).toContain('compress parameter is required');
    });

    it('should return 400 for invalid file', async () => {
      const formData = new FormData();
      const file = new File(['invalid video data'], 'invalid.avi', { type: 'video/x-msvideo' });
      formData.append('file', file);

      const res = await app.request('/video/frames?fps=1&compress=zip', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty('error');
    });
  });

  describe('POST /video/gif', () => {
    it('should convert AVI to GIF', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-gif.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/video/gif', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/gif');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    it('should respect width query param', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-gif-width.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/video/gif?width=160', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/gif');

      const arrayBuffer = await res.arrayBuffer();
      const dimensions = getImageDimensions(arrayBuffer, TEST_DIR);
      expect(dimensions.width).toBe(160);
    });

    it('should return 400 for invalid file', async () => {
      const formData = new FormData();
      const file = new File(['invalid video data'], 'invalid.avi', { type: 'video/x-msvideo' });
      formData.append('file', file);

      const res = await app.request('/video/gif', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty('error');
    });

    it('should return 400 for missing file', async () => {
      const formData = new FormData();

      const res = await app.request('/video/gif', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
    });
  });
});
