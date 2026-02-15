import type { Job } from 'bullmq';
import type { JobResult } from '..';
import type { VideoToMp4JobData, VideoExtractAudioJobData, VideoExtractFramesJobData } from './schemas';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { dirname, basename } from 'path';
import path from 'path';
import { uploadToS3 } from '~/utils/storage';

const execFileAsync = promisify(execFile);

const PROCESSING_TIMEOUT = 600000;

async function shouldCopyStreams(inputPath: string): Promise<boolean> {
  try {
    const { stdout: videoCodec } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath
      ],
      { timeout: 30000 }
    );

    const { stdout: audioCodec } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath
      ],
      { timeout: 30000 }
    );

    return videoCodec.trim() === 'h264' && audioCodec.trim() === 'aac';
  } catch {
    return false;
  }
}

export async function processVideoToMp4(job: Job<VideoToMp4JobData>): Promise<JobResult> {
  const { inputPath, outputPath, crf, preset, smartCopy } = job.data;

  if (!existsSync(inputPath)) {
    return {
      success: false,
      error: `Input file does not exist: ${inputPath}`
    };
  }

  try {
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });

    if (smartCopy && (await shouldCopyStreams(inputPath))) {
      await execFileAsync('ffmpeg', ['-i', inputPath, '-c', 'copy', '-movflags', '+faststart', '-y', outputPath], {
        timeout: PROCESSING_TIMEOUT
      });
    } else {
      await execFileAsync(
        'ffmpeg',
        [
          '-i',
          inputPath,
          '-codec:v',
          'libx264',
          '-preset',
          preset,
          '-crf',
          crf.toString(),
          '-codec:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          '-y',
          outputPath
        ],
        { timeout: PROCESSING_TIMEOUT }
      );
    }

    if (job.data.uploadToS3) {
      const { url } = await uploadToS3(outputPath, 'video/mp4', basename(outputPath));
      await rm(outputPath, { force: true });
      return {
        success: true,
        outputUrl: url
      };
    }

    return {
      success: true,
      outputPath
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to convert video to MP4: ${errorMessage}`
    };
  }
}

export async function processVideoExtractAudio(job: Job<VideoExtractAudioJobData>): Promise<JobResult> {
  const { inputPath, outputPath, mono } = job.data;

  if (!existsSync(inputPath)) {
    return {
      success: false,
      error: `Input file does not exist: ${inputPath}`
    };
  }

  try {
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });

    const args = ['-i', inputPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100'];

    if (mono) {
      args.push('-ac', '1');
    }

    args.push('-y', outputPath);

    await execFileAsync('ffmpeg', args, { timeout: PROCESSING_TIMEOUT });

    if (job.data.uploadToS3) {
      const { url } = await uploadToS3(outputPath, 'audio/wav', basename(outputPath));
      await rm(outputPath, { force: true });
      return {
        success: true,
        outputUrl: url
      };
    }

    return {
      success: true,
      outputPath
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to extract audio from video: ${errorMessage}`
    };
  }
}

export async function processVideoExtractFrames(job: Job<VideoExtractFramesJobData>): Promise<JobResult> {
  const { inputPath, outputDir, fps, format, quality, compress } = job.data;

  if (!existsSync(inputPath)) {
    return {
      success: false,
      error: `Input file does not exist: ${inputPath}`
    };
  }

  try {
    await mkdir(outputDir, { recursive: true });

    const ext = format === 'jpg' ? 'jpg' : 'png';
    const outputPattern = path.join(outputDir, `frame_%04d.${ext}`);

    const args = ['-i', inputPath, '-vf', `fps=${fps}`];

    if (format === 'jpg' && quality) {
      args.push('-q:v', quality.toString());
    }

    args.push('-y', outputPattern);

    await execFileAsync('ffmpeg', args, { timeout: PROCESSING_TIMEOUT });

    const { readdirSync } = await import('fs');
    const frames = readdirSync(outputDir)
      .filter((f) => f.endsWith(`.${ext}`))
      .map((f) => path.join(outputDir, f));

    if (frames.length === 0) {
      return {
        success: false,
        error: 'No frames were extracted from the video'
      };
    }

    if (compress === 'zip') {
      const { default: archiver } = await import('archiver');
      const { createWriteStream } = await import('fs');
      const archivePath = `${outputDir}.zip`;
      const output = createWriteStream(archivePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.pipe(output);
      archive.directory(outputDir, false);
      await archive.finalize();

      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        output.on('error', reject);
      });

      if (job.data.uploadToS3) {
        const { url } = await uploadToS3(archivePath, 'application/zip', basename(archivePath));
        await rm(dirname(outputDir), { recursive: true, force: true });
        return {
          success: true,
          outputUrl: url
        };
      }

      return {
        success: true,
        outputPath: archivePath
      };
    } else if (compress === 'gzip') {
      const tar = await import('tar');
      const archivePath = `${outputDir}.tar.gz`;

      await tar.c(
        {
          gzip: true,
          file: archivePath,
          cwd: dirname(outputDir)
        },
        [path.basename(outputDir)]
      );

      if (job.data.uploadToS3) {
        const { url } = await uploadToS3(archivePath, 'application/gzip', basename(archivePath));
        await rm(dirname(outputDir), { recursive: true, force: true });
        return {
          success: true,
          outputUrl: url
        };
      }

      return {
        success: true,
        outputPath: archivePath
      };
    }

    return {
      success: true,
      outputPaths: frames
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to extract frames from video: ${errorMessage}`
    };
  }
}
