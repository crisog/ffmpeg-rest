import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegrationTests, getApiUrl, getLocalStackEndpoint } from '~/test-utils/integration-setup';
import { ensureBucketExists } from '~/test-utils/s3';
import { readFile } from 'fs/promises';
import path from 'path';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

describe('Image Conversion Integration', () => {
  beforeAll(async () => {
    await setupIntegrationTests();
  }, 120000);

  it('should convert PNG to JPG', async () => {
    const apiUrl = getApiUrl();
    const testImagePath = path.join(__dirname, '../../../../../test-image.png');
    const imageBuffer = await readFile(testImagePath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
    formData.append('file', blob, 'test-image.png');

    const response = await fetch(`${apiUrl}/image/jpg`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 30000);

  it('should reject invalid file', async () => {
    const apiUrl = getApiUrl();
    const formData = new FormData();
    const blob = new Blob(['not an image'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const response = await fetch(`${apiUrl}/image/jpg`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  }, 30000);
});

describe('Image Conversion Integration - S3 Mode', () => {
  let s3Client: S3Client;
  const TEST_BUCKET = 'test-ffmpeg-bucket';

  beforeAll(async () => {
    await setupIntegrationTests({ s3Mode: true });

    const endpoint = getLocalStackEndpoint('s3');

    s3Client = new S3Client({
      endpoint,
      forcePathStyle: true,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    });

    await ensureBucketExists(s3Client, TEST_BUCKET);
  }, 180000);

  it('should convert PNG to JPG and upload to S3', async () => {
    const apiUrl = getApiUrl('s3');
    const testImagePath = path.join(__dirname, '../../../../../test-image.png');
    const imageBuffer = await readFile(testImagePath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
    formData.append('file', blob, 'test-image.png');

    const response = await fetch(`${apiUrl}/image/jpg/url`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('url');
    expect(json.url).toContain('test-media/');
    expect(json.url).toContain('.jpg');

    const key = json.url.split(`${TEST_BUCKET}/`)[1];
    const headResult = await s3Client.send(
      new HeadObjectCommand({
        Bucket: TEST_BUCKET,
        Key: key
      })
    );
    expect(headResult.ContentType).toBe('image/jpeg');
  }, 60000);

  it('should convert PNG to JPG and return binary from non-url endpoint in S3 mode', async () => {
    const apiUrl = getApiUrl('s3');
    const testImagePath = path.join(__dirname, '../../../../../test-image.png');
    const imageBuffer = await readFile(testImagePath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
    formData.append('file', blob, 'test-image.png');

    const response = await fetch(`${apiUrl}/image/jpg`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 60000);

  it('should resize image and return binary from non-url endpoint in S3 mode', async () => {
    const apiUrl = getApiUrl('s3');
    const testImagePath = path.join(__dirname, '../../../../../test-image.png');
    const imageBuffer = await readFile(testImagePath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
    formData.append('file', blob, 'test-image.png');

    const response = await fetch(`${apiUrl}/image/resize?width=200`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 60000);

  it('should reject invalid file', async () => {
    const apiUrl = getApiUrl('s3');
    const formData = new FormData();
    const blob = new Blob(['not an image file'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const response = await fetch(`${apiUrl}/image/jpg/url`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  }, 60000);
});
