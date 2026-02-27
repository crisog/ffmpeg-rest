import { z } from 'zod';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import path from 'path';
import { env } from '~/config/env';
import { addJob, queueEvents, validateJobResult, JobTypeName } from '~/queue';

export const JobPathsSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  jobDir: z.string()
});

export type JobPaths = z.infer<typeof JobPathsSchema>;

export const ProcessJobOptionsSchema = z.object({
  file: z.file(),
  jobType: z.string() as z.ZodType<JobTypeName>,
  outputExtension: z.string().min(1),
  jobData: z.function({
    input: [JobPathsSchema],
    output: z.record(z.string(), z.unknown())
  })
});

export type ProcessJobOptions = z.infer<typeof ProcessJobOptionsSchema>;

const SuccessResultSchema = z.object({
  success: z.literal(true),
  outputPath: z.string().optional(),
  outputUrl: z.string().url().optional(),
  outputBuffer: z.instanceof(Buffer).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const ErrorResultSchema = z.object({
  success: z.literal(false),
  error: z.string()
});

export const ProcessJobResultSchema = z.discriminatedUnion('success', [SuccessResultSchema, ErrorResultSchema]);

export type ProcessJobResult = z.infer<typeof ProcessJobResultSchema>;

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

  const cleanup = async () => {
    await rm(jobDir, { recursive: true, force: true });
  };

  try {
    await mkdir(jobDir, { recursive: true });

    const inputPath = path.join(jobDir, 'input');
    const outputPath = path.join(jobDir, `output.${outputExtension}`);

    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    const paths: JobPaths = { inputPath, outputPath, jobDir };
    const job = await addJob(jobType, jobData(paths));
    const rawResult = await job.waitUntilFinished(queueEvents);
    const result = validateJobResult(rawResult);

    if (!result.success) {
      await cleanup();
      return { success: false, error: result.error ?? 'Unknown error' };
    }

    if (result.outputUrl) {
      await cleanup();
      return { success: true, outputUrl: result.outputUrl, metadata: result.metadata };
    }

    if (result.outputPath) {
      const outputBuffer = await readFile(result.outputPath);
      await cleanup();
      return { success: true, outputPath: result.outputPath, outputBuffer, metadata: result.metadata };
    }

    await cleanup();
    return { success: false, error: 'No output produced' };
  } catch (error) {
    await cleanup();
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function getOutputFilename(originalName: string, newExtension: string): string {
  const baseName = originalName.replace(/\.[^.]+$/, '');
  return newExtension ? `${baseName}.${newExtension}` : baseName;
}
