import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegrationTests, getApiUrl } from '~/test-utils/integration-setup';
import { readFile } from 'fs/promises';
import path from 'path';

describe('Media Probing Integration', () => {
  beforeAll(async () => {
    await setupIntegrationTests();
  }, 120000);

  it('should probe video file metadata', async () => {
    const apiUrl = getApiUrl();
    const testVideoPath = path.join(__dirname, '../../../../../test-video.mp4');
    const videoBuffer = await readFile(testVideoPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('file', blob, 'test-video.mp4');

    const response = await fetch(`${apiUrl}/media/info`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const result = await response.json();
    expect(result).toHaveProperty('format');
    expect(result).toHaveProperty('streams');
    expect(result.format).toHaveProperty('format_name');
    expect(result.format).toHaveProperty('duration');
    expect(Array.isArray(result.streams)).toBe(true);
    expect(result.streams.length).toBeGreaterThan(0);
  }, 30000);

  it('should probe audio file metadata', async () => {
    const apiUrl = getApiUrl();
    const testAudioPath = path.join(__dirname, '../../../../../test-audio.wav');
    const audioBuffer = await readFile(testAudioPath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'test-audio.wav');

    const response = await fetch(`${apiUrl}/media/info`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const result = await response.json();
    expect(result).toHaveProperty('format');
    expect(result).toHaveProperty('streams');
    expect(result.format.format_name).toContain('wav');
  }, 30000);

  it('should probe image file metadata', async () => {
    const apiUrl = getApiUrl();
    const testImagePath = path.join(__dirname, '../../../../../test-image.png');
    const imageBuffer = await readFile(testImagePath);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
    formData.append('file', blob, 'test-image.png');

    const response = await fetch(`${apiUrl}/media/info`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const result = await response.json();
    expect(result).toHaveProperty('format');
    expect(result).toHaveProperty('streams');
  }, 30000);

  it('should reject invalid file', async () => {
    const apiUrl = getApiUrl();
    const formData = new FormData();
    const blob = new Blob(['not a media file'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const response = await fetch(`${apiUrl}/media/info`, {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  }, 30000);
});
