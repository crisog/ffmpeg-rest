import { extname } from 'path';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.zip': 'application/zip',
  '.gz': 'application/gzip'
};

export function getMimeType(ext: string, fallback = 'application/octet-stream'): string {
  const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return MIME_TYPES[normalized] ?? fallback;
}

export function getExtensionFromFilename(filename: string, fallback = 'png'): string {
  const ext = extname(filename);
  if (!ext) {
    return fallback;
  }
  return ext.slice(1).toLowerCase();
}
