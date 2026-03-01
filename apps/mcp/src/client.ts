import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

interface ApiConfig {
  baseUrl: string;
  token: string | undefined;
}

let cachedConfig: ApiConfig | null = null;

export const getApiConfig = (): ApiConfig => {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    baseUrl: (process.env['FFMPEG_API_URL'] ?? 'http://localhost:3000').replace(/\/$/, ''),
    token: process.env['FFMPEG_API_TOKEN']
  };
  return cachedConfig;
};

const buildHeaders = (config: ApiConfig): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }
  return headers;
};

const buildUrl = (
  baseUrl: string,
  endpoint: string,
  queryParams?: Record<string, string | number | boolean | undefined>
): URL => {
  const url = new URL(`${baseUrl}${endpoint}`);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
};

const buildFormData = async (inputPath: string): Promise<FormData> => {
  const fileBuffer = await readFile(inputPath);
  const blob = new Blob([fileBuffer]);
  const formData = new FormData();
  formData.append('file', blob, basename(inputPath));
  return formData;
};

/**
 * POSTs a file to the endpoint, writes the binary response to outputPath.
 */
export const postFileBinary = async (
  endpoint: string,
  inputPath: string,
  outputPath: string,
  queryParams?: Record<string, string | number | boolean | undefined>
): Promise<string> => {
  const config = getApiConfig();
  const url = buildUrl(config.baseUrl, endpoint, queryParams);
  const formData = await buildFormData(inputPath);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: buildHeaders(config),
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));
  return outputPath;
};

/**
 * POSTs a file to the endpoint and returns the parsed JSON response.
 */
export const postFileJson = async <T>(
  endpoint: string,
  inputPath: string,
  queryParams?: Record<string, string | number | boolean | undefined>
): Promise<T> => {
  const config = getApiConfig();
  const url = buildUrl(config.baseUrl, endpoint, queryParams);
  const formData = await buildFormData(inputPath);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: buildHeaders(config),
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
};
