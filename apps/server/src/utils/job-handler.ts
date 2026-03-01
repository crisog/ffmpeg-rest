import { z } from 'zod';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import path from 'path';
import { env } from '~/config/env';
import { addJob, queueEvents, validateJobResult, JobTypeName } from '~/queue';
import { computeCacheKey, getCachedOutput, putCachedOutput, isCacheEligibleJobData } from '~/utils/cache';

const JobPathsSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  jobDir: z.string()
});

type JobPaths = z.infer<typeof JobPathsSchema>;

const ProcessJobOptionsSchema = z.object({
  file: z.file(),
  jobType: z.string() as z.ZodType<JobTypeName>,
  outputExtension: z.string().min(1),
  jobData: z.function({
    input: [JobPathsSchema],
    output: z.record(z.string(), z.unknown())
  })
});

type ProcessJobOptions = z.infer<typeof ProcessJobOptionsSchema>;

type ProcessJobResult =
  | {
      success: true;
      outputPath?: string;
      outputUrl?: string;
      outputBuffer?: Buffer;
      metadata?: Record<string, unknown>;
    }
  | {
      success: false;
      error: string;
    };

export async function processMediaJob(options: ProcessJobOptions): Promise<ProcessJobResult> {
  const validated = ProcessJobOptionsSchema.safeParse(options);
  if (!validated.success) {
    return {
      success: false,
      error: `Invalid options: ${validated.error.message}`
    };
  }

  const { file, jobType, outputExtension, jobData } = validated.data;

  const jobId = randomUUID();
  const jobDir = path.join(env.TEMP_DIR, jobId);
  const inputPath = path.join(jobDir, 'input');
  const outputPath = path.join(jobDir, `output.${outputExtension}`);

  const cleanup = async () => {
    await rm(jobDir, { recursive: true, force: true });
  };

  try {
    const paths: JobPaths = { inputPath, outputPath, jobDir };
    const payload = jobData(paths);

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const canUseCache = env.CACHE_ENABLED && isCacheEligibleJobData(payload);
    let cacheKey: string | null = null;
    if (canUseCache) {
      cacheKey = computeCacheKey(inputBuffer, jobType, outputExtension, payload);
    }

    if (cacheKey) {
      const cached = await getCachedOutput(cacheKey);
      if (cached) {
        return {
          success: true,
          outputBuffer: cached.outputBuffer,
          metadata: cached.metadata
        };
      }
    }

    await mkdir(jobDir, { recursive: true });
    await writeFile(inputPath, inputBuffer);

    const job = await addJob(jobType, payload);
    const rawResult = await job.waitUntilFinished(queueEvents);
    const result = validateJobResult(rawResult);

    if (!result.success) {
      return { success: false, error: result.error ?? 'Unknown error' };
    }

    if (result.outputUrl) {
      return { success: true, outputUrl: result.outputUrl, metadata: result.metadata };
    }

    if (result.outputPath) {
      const outputBuffer = await readFile(result.outputPath);

      if (cacheKey) {
        await putCachedOutput(cacheKey, outputBuffer, result.metadata);
      }

      return { success: true, outputPath: result.outputPath, outputBuffer, metadata: result.metadata };
    }

    return { success: false, error: 'No output produced' };
  } catch (error) {
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    return {
      success: false,
      error: errorMessage
    };
  } finally {
    await cleanup();
  }
}

export function getOutputFilename(originalName: string, newExtension: string): string {
  const baseName = originalName.replace(/\.[^.]+$/, '');
  if (newExtension) {
    return `${baseName}.${newExtension}`;
  }

  return baseName;
}
