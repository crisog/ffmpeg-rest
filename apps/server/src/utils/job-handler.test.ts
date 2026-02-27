import { describe, it, expect } from 'vitest';
import { getOutputFilename } from './job-handler';

describe('getOutputFilename', () => {
  it('should replace extension with new extension', () => {
    expect(getOutputFilename('video.mp4', 'avi')).toBe('video.avi');
    expect(getOutputFilename('audio.wav', 'mp3')).toBe('audio.mp3');
    expect(getOutputFilename('image.png', 'jpg')).toBe('image.jpg');
  });

  it('should handle files with multiple dots', () => {
    expect(getOutputFilename('my.video.file.mp4', 'avi')).toBe('my.video.file.avi');
    expect(getOutputFilename('archive.tar.gz', 'zip')).toBe('archive.tar.zip');
  });

  it('should return base name without dot when extension is empty', () => {
    expect(getOutputFilename('video.mp4', '')).toBe('video');
    expect(getOutputFilename('document.pdf', '')).toBe('document');
  });

  it('should work correctly for frame extraction filenames', () => {
    const baseName = getOutputFilename('video.mp4', '');
    const frameFilename = `${baseName}_frames.zip`;
    expect(frameFilename).toBe('video_frames.zip');
  });

  it('should handle files without extension', () => {
    expect(getOutputFilename('README', 'txt')).toBe('README.txt');
    expect(getOutputFilename('Makefile', '')).toBe('Makefile');
  });
});
