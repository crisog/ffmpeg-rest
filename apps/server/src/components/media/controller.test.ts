import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '~/app';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import { Worker } from 'bullmq';
import { createTestWorker } from '~/test-utils/worker';
import { createTestAviFile, createTestMp3File } from '~/test-utils/fixtures';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'media-controller');
const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures', 'media-controller');

describe('Media Controller', () => {
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

  describe('POST /media/info', () => {
    it('should probe video file and return metadata', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-video.avi');
      createTestAviFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.avi', {
        type: 'video/x-msvideo'
      });
      formData.append('file', file);

      const res = await app.request('/media/info', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const json = await res.json();
      expect(json).toHaveProperty('format');
      expect(json).toHaveProperty('streams');
      expect(json.format).toHaveProperty('format_name');
      expect(json.streams).toBeInstanceOf(Array);
      expect(json.streams.length).toBeGreaterThan(0);
    });

    it('should probe audio file and return metadata', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test-audio.mp3');
      createTestMp3File(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.mp3', {
        type: 'audio/mpeg'
      });
      formData.append('file', file);

      const res = await app.request('/media/info', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const json = await res.json();
      expect(json).toHaveProperty('format');
      expect(json).toHaveProperty('streams');
      expect(json.format.format_name).toContain('mp3');
    });

    it('should return 400 for invalid file', async () => {
      const formData = new FormData();
      const file = new File(['invalid media data'], 'invalid.mp3', { type: 'audio/mpeg' });
      formData.append('file', file);

      const res = await app.request('/media/info', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty('error');
    });

    it('should return 400 for missing file', async () => {
      const formData = new FormData();

      const res = await app.request('/media/info', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
    });
  });
});
