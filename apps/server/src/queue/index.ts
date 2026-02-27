import { Queue, QueueEvents } from 'bullmq';
import { connection } from '~/config/redis';
import { logger } from '~/config/logger';
import { JobResultSchema, QUEUE_NAME } from '@shared/queue/contracts';
import type { JobResult } from '@shared/queue/contracts';

export { JobType, type JobTypeName, QUEUE_NAME, type JobResult } from '@shared/queue/contracts';

export const queue = new Queue<unknown, JobResult>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: {
      age: 3600,
      count: 100
    },
    removeOnFail: {
      age: 86400,
      count: 500
    }
  }
});

export const queueEvents = new QueueEvents(QUEUE_NAME, { connection });

export const addJob = async (name: string, data: unknown) => {
  logger.debug({ jobType: name, data }, 'Adding job to queue');

  try {
    const job = await queue.add(name, data);
    logger.info({ jobId: job.id, jobType: name }, 'Job added to queue');
    return job;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ jobType: name, error: errorMessage }, 'Failed to add job');
    throw error;
  }
};

export const validateJobResult = (result: unknown): JobResult => {
  try {
    return JobResultSchema.parse(result);
  } catch (error) {
    logger.error({ error, result }, 'Job result validation failed');
    throw new Error('Invalid job result format from queue');
  }
};
