import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '~/app';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import { Worker } from 'bullmq';
import { createTestWorker } from '~/test-utils/worker';
import { createTestPngFile } from '~/test-utils/fixtures';
import { getImageDimensions } from '~/test-utils/probes';

const TEST_DIR = path.join(process.cwd(), 'test-outputs', 'image-controller');
const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures', 'image-controller');

describe('Image Controller', () => {
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

  describe('POST /image/jpg', () => {
    it('should convert PNG to JPG', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'test.png');
      createTestPngFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'test.png', {
        type: 'image/png'
      });
      formData.append('file', file);

      const res = await app.request('/image/jpg', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    it('should return 400 for invalid file', async () => {
      const formData = new FormData();
      const file = new File(['invalid image data'], 'invalid.png', { type: 'image/png' });
      formData.append('file', file);

      const res = await app.request('/image/jpg', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty('error');
    });

    it('should return 400 for missing file', async () => {
      const formData = new FormData();

      const res = await app.request('/image/jpg', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /image/resize', () => {
    it('should resize image with width parameter', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'resize-test.png');
      createTestPngFile(inputPath, 640, 480);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'resize-test.png', { type: 'image/png' });
      formData.append('file', file);

      const res = await app.request('/image/resize?width=320', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('content-disposition')).toContain('resize-test.png');

      const arrayBuffer = await res.arrayBuffer();
      const dimensions = getImageDimensions(arrayBuffer, TEST_DIR);
      expect(dimensions.width).toBe(320);
      expect(dimensions.height).toBe(240);
    });

    it('should resize image with height parameter', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'resize-height-test.png');
      createTestPngFile(inputPath, 640, 480);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'resize-height-test.png', { type: 'image/png' });
      formData.append('file', file);

      const res = await app.request('/image/resize?height=240', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');

      const arrayBuffer = await res.arrayBuffer();
      const dimensions = getImageDimensions(arrayBuffer, TEST_DIR);
      expect(dimensions.width).toBe(320);
      expect(dimensions.height).toBe(240);
    });

    it('should resize image with both dimensions and mode', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'resize-both-test.png');
      createTestPngFile(inputPath, 640, 480);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'resize-both-test.png', { type: 'image/png' });
      formData.append('file', file);

      const res = await app.request('/image/resize?width=200&height=200&mode=force', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');

      const arrayBuffer = await res.arrayBuffer();
      const dimensions = getImageDimensions(arrayBuffer, TEST_DIR);
      expect(dimensions.width).toBe(200);
      expect(dimensions.height).toBe(200);
    });

    it('should resize with fill mode', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'resize-fill-test.png');
      createTestPngFile(inputPath, 640, 480);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'resize-fill-test.png', { type: 'image/png' });
      formData.append('file', file);

      const res = await app.request('/image/resize?width=200&height=200&mode=fill', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');

      const arrayBuffer = await res.arrayBuffer();
      const dimensions = getImageDimensions(arrayBuffer, TEST_DIR);
      expect(dimensions.width).toBe(200);
      expect(dimensions.height).toBe(200);
    });

    it('should return 400 when no dimensions specified', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'resize-nodims-test.png');
      createTestPngFile(inputPath);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'resize-nodims-test.png', { type: 'image/png' });
      formData.append('file', file);

      const res = await app.request('/image/resize', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('width or height');
    });

    it('should return 400 for fill mode with only width', async () => {
      const inputPath = path.join(FIXTURES_DIR, 'resize-fill-width-only.png');
      createTestPngFile(inputPath, 640, 480);

      const formData = new FormData();
      const fileBuffer = readFileSync(inputPath);
      const file = new File([fileBuffer], 'resize-fill-width-only.png', { type: 'image/png' });
      formData.append('file', file);

      const res = await app.request('/image/resize?width=200&mode=fill', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Fill mode requires both width and height');
    });

    it('should return 400 for invalid file', async () => {
      const formData = new FormData();
      const file = new File(['invalid image data'], 'invalid.png', { type: 'image/png' });
      formData.append('file', file);

      const res = await app.request('/image/resize?width=100', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty('error');
    });

    it('should return 400 for missing file', async () => {
      const formData = new FormData();

      const res = await app.request('/image/resize?width=100', {
        method: 'POST',
        body: formData
      });

      expect(res.status).toBe(400);
    });
  });
});
