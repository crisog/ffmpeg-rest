import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegrationTests } from './test-utils/integration-setup';

describe('FFmpeg REST API Integration', () => {
  let apiUrl: string;

  beforeAll(async () => {
    const setup = await setupIntegrationTests();
    apiUrl = setup.apiUrl;
  }, 120000);

  it('should return API documentation on root endpoint', async () => {
    const response = await fetch(`${apiUrl}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('FFmpeg REST API');
  }, 10000);

  it('should list available endpoints', async () => {
    const response = await fetch(`${apiUrl}/endpoints`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.endpoints)).toBe(true);
    expect(body.endpoints.length).toBeGreaterThan(0);
  }, 10000);
});
