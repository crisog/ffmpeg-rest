import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFile, writeFile } from 'fs/promises';
import { clearCacheTestEnv, createTempDirTracker, setCacheTestEnv } from '../test-utils/test-helpers';

const { createTempDir, cleanupTempDirs } = createTempDirTracker();

function createInputFile(content = 'input-media'): File {
  return new File([Buffer.from(content)], 'input.wav', { type: 'audio/wav' });
}

async function loadJobHandler(options: {
  tempDir: string;
  cacheDir: string;
  cacheEnabled: boolean;
  addJobImpl: (
    jobType: string,
    data: Record<string, unknown>
  ) => Promise<{ waitUntilFinished: () => Promise<unknown> }>;
}) {
  vi.resetModules();
  vi.clearAllMocks();

  setCacheTestEnv({
    tempDir: options.tempDir,
    cacheDir: options.cacheDir,
    cacheEnabled: options.cacheEnabled
  });

  const addJobMock = vi.fn(options.addJobImpl);
  const validateJobResultMock = vi.fn((result: unknown) => result);

  vi.doMock('~/queue', () => ({
    addJob: addJobMock,
    queueEvents: {},
    validateJobResult: validateJobResultMock,
    JobTypeName: {}
  }));

  const module = await import('./job-handler');
  return {
    ...module,
    addJobMock,
    validateJobResultMock
  };
}

afterEach(async () => {
  await cleanupTempDirs();
  clearCacheTestEnv();
});

describe('processMediaJob cache behavior', () => {
  it('should skip queue on cache hit for identical binary requests', async () => {
    const tempDir = await createTempDir('job-handler-cache-temp-');
    const cacheDir = await createTempDir('job-handler-cache-dir-');

    const { processMediaJob, addJobMock } = await loadJobHandler({
      tempDir,
      cacheDir,
      cacheEnabled: true,
      addJobImpl: async (_jobType, data) => {
        const outputPath = data['outputPath'] as string;
        await writeFile(outputPath, Buffer.from('converted-audio'));
        return {
          waitUntilFinished: async () => ({
            success: true,
            outputPath,
            metadata: { codec: 'mp3' }
          })
        };
      }
    });

    const result1 = await processMediaJob({
      file: createInputFile(),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2
      })
    });

    expect(result1.success).toBe(true);
    if (result1.success) {
      expect(result1.outputBuffer?.toString()).toBe('converted-audio');
      expect(result1.metadata).toEqual({ codec: 'mp3' });
    }

    const result2 = await processMediaJob({
      file: createInputFile(),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2
      })
    });

    expect(result2.success).toBe(true);
    if (result2.success) {
      expect(result2.outputBuffer?.toString()).toBe('converted-audio');
      expect(result2.metadata).toEqual({ codec: 'mp3' });
    }

    expect(addJobMock).toHaveBeenCalledTimes(1);
  });

  it('should miss cache when processing parameters differ', async () => {
    const tempDir = await createTempDir('job-handler-param-temp-');
    const cacheDir = await createTempDir('job-handler-param-cache-');

    const { processMediaJob, addJobMock } = await loadJobHandler({
      tempDir,
      cacheDir,
      cacheEnabled: true,
      addJobImpl: async (_jobType, data) => {
        const outputPath = data['outputPath'] as string;
        const quality = data['quality'] as number;
        await writeFile(outputPath, Buffer.from(`quality-${quality}`));
        return {
          waitUntilFinished: async () => ({
            success: true,
            outputPath
          })
        };
      }
    });

    const first = await processMediaJob({
      file: createInputFile(),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2
      })
    });

    const second = await processMediaJob({
      file: createInputFile(),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 7
      })
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.outputBuffer?.toString()).toBe('quality-2');
      expect(second.outputBuffer?.toString()).toBe('quality-7');
    }
    expect(addJobMock).toHaveBeenCalledTimes(2);
  });

  it('should miss cache when input bytes differ', async () => {
    const tempDir = await createTempDir('job-handler-input-temp-');
    const cacheDir = await createTempDir('job-handler-input-cache-');

    const { processMediaJob, addJobMock } = await loadJobHandler({
      tempDir,
      cacheDir,
      cacheEnabled: true,
      addJobImpl: async (_jobType, data) => {
        const inputPath = data['inputPath'] as string;
        const outputPath = data['outputPath'] as string;
        const inputContent = await readFile(inputPath, 'utf8');
        await writeFile(outputPath, Buffer.from(`from-${inputContent}`));
        return {
          waitUntilFinished: async () => ({
            success: true,
            outputPath
          })
        };
      }
    });

    const first = await processMediaJob({
      file: createInputFile('input-a'),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2
      })
    });

    const second = await processMediaJob({
      file: createInputFile('input-b'),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2
      })
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.outputBuffer?.toString()).toBe('from-input-a');
      expect(second.outputBuffer?.toString()).toBe('from-input-b');
    }
    expect(addJobMock).toHaveBeenCalledTimes(2);
  });

  it('should not reuse cached output when cache is disabled', async () => {
    const tempDir = await createTempDir('job-handler-disabled-temp-');
    const cacheDir = await createTempDir('job-handler-disabled-cache-');
    let callCount = 0;

    const { processMediaJob, addJobMock } = await loadJobHandler({
      tempDir,
      cacheDir,
      cacheEnabled: false,
      addJobImpl: async (_jobType, data) => {
        callCount += 1;
        const outputPath = data['outputPath'] as string;
        await writeFile(outputPath, Buffer.from(`call-${callCount}`));
        return {
          waitUntilFinished: async () => ({
            success: true,
            outputPath
          })
        };
      }
    });

    const first = await processMediaJob({
      file: createInputFile(),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2
      })
    });

    const second = await processMediaJob({
      file: createInputFile(),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2
      })
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.outputBuffer?.toString()).toBe('call-1');
      expect(second.outputBuffer?.toString()).toBe('call-2');
    }
    expect(addJobMock).toHaveBeenCalledTimes(2);
  });

  it('should bypass cache for uploadToS3 jobs', async () => {
    const tempDir = await createTempDir('job-handler-s3-temp-');
    const cacheDir = await createTempDir('job-handler-s3-cache-');

    const { processMediaJob, addJobMock } = await loadJobHandler({
      tempDir,
      cacheDir,
      cacheEnabled: true,
      addJobImpl: async () => {
        return {
          waitUntilFinished: async () => ({
            success: true,
            outputUrl: 'https://example.com/output.mp3'
          })
        };
      }
    });

    const first = await processMediaJob({
      file: createInputFile(),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2,
        uploadToS3: true
      })
    });

    const second = await processMediaJob({
      file: createInputFile(),
      jobType: 'audio:mp3',
      outputExtension: 'mp3',
      jobData: ({ inputPath, outputPath }) => ({
        inputPath,
        outputPath,
        quality: 2,
        uploadToS3: true
      })
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.outputUrl).toBe('https://example.com/output.mp3');
      expect(second.outputUrl).toBe('https://example.com/output.mp3');
    }
    expect(addJobMock).toHaveBeenCalledTimes(2);
  });
});

describe('getOutputFilename', () => {
  it('should replace extension with new extension', async () => {
    const { getOutputFilename } = await import('./job-handler');
    expect(getOutputFilename('video.mp4', 'avi')).toBe('video.avi');
    expect(getOutputFilename('audio.wav', 'mp3')).toBe('audio.mp3');
    expect(getOutputFilename('image.png', 'jpg')).toBe('image.jpg');
  });

  it('should handle files with multiple dots', async () => {
    const { getOutputFilename } = await import('./job-handler');
    expect(getOutputFilename('my.video.file.mp4', 'avi')).toBe('my.video.file.avi');
    expect(getOutputFilename('archive.tar.gz', 'zip')).toBe('archive.tar.zip');
  });

  it('should return base name without dot when extension is empty', async () => {
    const { getOutputFilename } = await import('./job-handler');
    expect(getOutputFilename('video.mp4', '')).toBe('video');
    expect(getOutputFilename('document.pdf', '')).toBe('document');
  });

  it('should work correctly for frame extraction filenames', async () => {
    const { getOutputFilename } = await import('./job-handler');
    const baseName = getOutputFilename('video.mp4', '');
    const frameFilename = `${baseName}_frames.zip`;
    expect(frameFilename).toBe('video_frames.zip');
  });

  it('should handle files without extension', async () => {
    const { getOutputFilename } = await import('./job-handler');
    expect(getOutputFilename('README', 'txt')).toBe('README.txt');
    expect(getOutputFilename('Makefile', '')).toBe('Makefile');
  });
});
