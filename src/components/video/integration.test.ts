import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegrationTests, getApiUrl, getLocalStackEndpoint } from '~/test-utils/integration-setup';
import { ensureBucketExists } from '~/test-utils/s3';
import { readFile } from 'fs/promises';
import path from 'path';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

describe('Video Processing Integration', () => {
  beforeAll(async () => {
    await setupIntegrationTests();
  }, 120000);

  it('should convert video to MP4', async () => {
    const apiUrl = getApiUrl();
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/mp4`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 30000);

  it('should extract audio from video', async () => {
    const apiUrl = getApiUrl();
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/audio`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 30000);

  it('should extract frames from video', async () => {
    const apiUrl = getApiUrl();
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/frames?fps=1&compress=zip`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 30000);

  it('should convert video to GIF', async () => {
    const apiUrl = getApiUrl();
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/gif?fps=10`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/gif');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 30000);

  it('should reject invalid file', async () => {
    const apiUrl = getApiUrl();
    const formData = new FormData();
    const blob = new Blob(['not a video file'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const response = await fetch(`${apiUrl}/video/mp4`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  }, 30000);
});

describe('Video Processing Integration - S3 Mode', () => {
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

  it('should convert video to MP4 and upload to S3', async () => {
    const apiUrl = getApiUrl('s3');
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/mp4/url`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('url');
    expect(json.url).toContain('test-media/');
    expect(json.url).toContain('.mp4');

    const key = json.url.split(`${TEST_BUCKET}/`)[1];
    const headResult = await s3Client.send(
      new HeadObjectCommand({
        Bucket: TEST_BUCKET,
        Key: key
      })
    );
    expect(headResult.ContentType).toBe('video/mp4');
  }, 60000);

  it('should convert video to MP4 and return binary from non-url endpoint in S3 mode', async () => {
    const apiUrl = getApiUrl('s3');
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/mp4`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 60000);

  it('should extract audio to WAV and upload to S3', async () => {
    const apiUrl = getApiUrl('s3');
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/audio/url`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('url');
    expect(json.url).toContain('test-media/');
    expect(json.url).toContain('.wav');

    const key = json.url.split(`${TEST_BUCKET}/`)[1];
    const headResult = await s3Client.send(
      new HeadObjectCommand({
        Bucket: TEST_BUCKET,
        Key: key
      })
    );
    expect(headResult.ContentType).toBe('audio/wav');
  }, 60000);

  it('should extract audio to WAV and return binary from non-url endpoint in S3 mode', async () => {
    const apiUrl = getApiUrl('s3');
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/audio`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 60000);

  it('should extract frames and upload archive to S3', async () => {
    const apiUrl = getApiUrl('s3');
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/frames/url?fps=1&compress=zip`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('url');
    expect(json.url).toContain('test-media/');
    expect(json.url).toContain('.zip');

    const key = json.url.split(`${TEST_BUCKET}/`)[1];
    const headResult = await s3Client.send(
      new HeadObjectCommand({
        Bucket: TEST_BUCKET,
        Key: key
      })
    );
    expect(headResult.ContentType).toBe('application/zip');
  }, 60000);

  it('should extract frames and return archive from non-url endpoint in S3 mode', async () => {
    const apiUrl = getApiUrl('s3');
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/frames?fps=1&compress=zip`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 60000);

  it('should convert video to GIF and upload to S3', async () => {
    const apiUrl = getApiUrl('s3');
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/gif/url?fps=10`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('url');
    expect(json.url).toContain('test-media/');
    expect(json.url).toContain('.gif');

    const key = json.url.split(`${TEST_BUCKET}/`)[1];
    const headResult = await s3Client.send(
      new HeadObjectCommand({
        Bucket: TEST_BUCKET,
        Key: key
      })
    );
    expect(headResult.ContentType).toBe('image/gif');
  }, 60000);

  it('should convert video to GIF and return binary from non-url endpoint in S3 mode', async () => {
    const apiUrl = getApiUrl('s3');
    const testVideoPath = path.join(__dirname, '../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/video/gif`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/gif');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 60000);

  it('should reject invalid file for video conversion', async () => {
    const apiUrl = getApiUrl('s3');
    const formData = new FormData();
    const blob = new Blob(['not a video file'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const response = await fetch(`${apiUrl}/video/mp4/url`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  }, 60000);
});
