import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegrationTests, getApiUrl, getLocalStackEndpoint } from '~/test-utils/integration-setup';
import { ensureBucketExists } from '~/test-utils/s3';
import { readFile } from 'fs/promises';
import path from 'path';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

describe('Audio Conversion Integration', () => {
  beforeAll(async () => {
    await setupIntegrationTests();
  }, 120000);

  it('should convert WAV to MP3', async () => {
    const apiUrl = getApiUrl();
    const testAudioPath = path.join(__dirname, '../../../../../test-audio.wav');
    const audioBuffer = await readFile(testAudioPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'test-audio.wav');

    const response = await fetch(`${apiUrl}/audio/mp3`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 30000);

  it('should convert WAV to WAV (re-encode)', async () => {
    const apiUrl = getApiUrl();
    const testAudioPath = path.join(__dirname, '../../../../../test-audio.wav');
    const audioBuffer = await readFile(testAudioPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'test-audio.wav');

    const response = await fetch(`${apiUrl}/audio/wav`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 30000);

  it('should reject invalid file', async () => {
    const apiUrl = getApiUrl();
    const formData = new FormData();
    const blob = new Blob(['not an audio file'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const response = await fetch(`${apiUrl}/audio/mp3`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  }, 30000);
});

describe('Audio Conversion Integration - S3 Mode', () => {
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

  it('should convert WAV to MP3 and upload to S3', async () => {
    const apiUrl = getApiUrl('s3');
    const testAudioPath = path.join(__dirname, '../../../../../test-audio.wav');
    const audioBuffer = await readFile(testAudioPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'test-audio.wav');

    const response = await fetch(`${apiUrl}/audio/mp3/url`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('url');
    expect(json.url).toContain('test-media/');
    expect(json.url).toContain('.mp3');

    const key = json.url.split(`${TEST_BUCKET}/`)[1];
    const headResult = await s3Client.send(
      new HeadObjectCommand({
        Bucket: TEST_BUCKET,
        Key: key
      })
    );
    expect(headResult.ContentType).toBe('audio/mpeg');
  }, 60000);

  it('should convert WAV to MP3 and return binary from non-url endpoint in S3 mode', async () => {
    const apiUrl = getApiUrl('s3');
    const testAudioPath = path.join(__dirname, '../../../../../test-audio.wav');
    const audioBuffer = await readFile(testAudioPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'test-audio.wav');

    const response = await fetch(`${apiUrl}/audio/mp3`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 60000);

  it('should convert MP3 to WAV and upload to S3', async () => {
    const apiUrl = getApiUrl('s3');
    const testAudioPath = path.join(__dirname, '../../../../../test-audio.wav');
    const audioBuffer = await readFile(testAudioPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'test-audio.wav');

    const response = await fetch(`${apiUrl}/audio/wav/url`, {
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

  it('should convert WAV to WAV and return binary from non-url endpoint in S3 mode', async () => {
    const apiUrl = getApiUrl('s3');
    const testAudioPath = path.join(__dirname, '../../../../../test-audio.wav');
    const audioBuffer = await readFile(testAudioPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'test-audio.wav');

    const response = await fetch(`${apiUrl}/audio/wav`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');

    const resultBuffer = await response.arrayBuffer();
    expect(resultBuffer.byteLength).toBeGreaterThan(0);
  }, 60000);

  it('should reject invalid file for MP3 conversion', async () => {
    const apiUrl = getApiUrl('s3');
    const formData = new FormData();
    const blob = new Blob(['not an audio file'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const response = await fetch(`${apiUrl}/audio/mp3/url`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  }, 60000);
});
