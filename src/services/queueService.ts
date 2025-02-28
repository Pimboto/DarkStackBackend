// src/services/queueService.ts
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { createRedisClient } from '../config/redis.ts';
import logger from '../utils/logger.ts';
import { EventEmitter } from 'events';

/**
 * Tipos de trabajo
 */
export type JobType = 'basicBot' | 'chatBot' | 'engagementBot';

/**
 * Emisor global de eventos
 */
export const queueEmitter = new EventEmitter();

/**
 * Estructuras de mapeo
 */
const queueMap = new Map<string, Queue>();
const workerMap = new Map<string, Worker>();
const queueEventsMap = new Map<string, QueueEvents>();

/**
 * Retorna clave y nombre de la cola
 */
function getQueueKey(jobType: JobType, userId: string) {
  return `${jobType}:${userId}`;
}
function getQueueName(jobType: JobType, userId: string) {
  return `bsky:${jobType}:${userId}`;
}

/**
 * Configura QueueEvents
 */
function setupQueueEvents(queueEvents: QueueEvents, queueName: string): void {
  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    const result = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
    queueEmitter.emit('job:completed', { jobId, result, queueName });
    logger.debug(`[${queueName}] Job ${jobId} completed`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    queueEmitter.emit('job:failed', { jobId, error: failedReason, queueName });
    logger.error(`[${queueName}] Job ${jobId} failed: ${failedReason}`);
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    const progress = typeof data === 'string' ? parseInt(data, 10) : data;
    queueEmitter.emit('job:progress', { jobId, progress, queueName });
    logger.debug(`[${queueName}] Job ${jobId} progress: ${progress}`);
  });
}

/**
 * Configura eventos Worker
 */
function setupWorkerEvents(worker: Worker, queueName: string): void {
  worker.on('error', (err) => {
    logger.error(`[${queueName}] Worker error:`, err);
    queueEmitter.emit('worker:error', { queueName, error: err.message });
  });

  worker.on('failed', (job, err) => {
    if (job) {
      logger.error(`[${queueName}] Job ${job.id} failed:`, err);
      queueEmitter.emit('job:failed', {
        jobId: job.id,
        error: err.message,
        queueName,
        parentId: job.data.parentId || null,
      });
    }
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[${queueName}] Job ${jobId} stalled`);
    queueEmitter.emit('job:stalled', { jobId, queueName });
  });
}

/**
 * Crea o retorna una Queue
 */
export function getQueue(jobType: JobType, userId: string): Queue {
  const queueKey = getQueueKey(jobType, userId);
  if (!queueMap.has(queueKey)) {
    const queueName = getQueueName(jobType, userId);
    const connection = createRedisClient();

    logger.info(`Creating queue '${queueName}' for user ${userId}`);

    const queueOpts = {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 3000 },
      },
    };

    const queue = new Queue(queueName, queueOpts);
    queueMap.set(queueKey, queue);

    // QueueEvents
    const queueEvents = new QueueEvents(queueName, { connection });
    setupQueueEvents(queueEvents, queueName);
    queueEventsMap.set(queueKey, queueEvents);

    // QueueScheduler was removed as it's deprecated in BullMQ 2.0+ 
    // (You're using BullMQ 5.41.7)
  }

  return queueMap.get(queueKey)!;
}

/**
 * Crea Worker (o lo reemplaza)
 */
export function createWorker(
  jobType: JobType,
  userId: string,
  concurrency: number,
  processor: (job: Job<any, any, any>) => Promise<any>
): Worker {
  const queueKey = getQueueKey(jobType, userId);
  const queueName = getQueueName(jobType, userId);

  // Si existe worker previo
  if (workerMap.has(queueKey)) {
    logger.info(`Closing existing worker for queue '${queueName}'`);
    workerMap.get(queueKey)!.close();
  }

  logger.info(
    `Creating worker for queue '${queueName}' concurrency=${concurrency}`
  );

  const worker = new Worker(
    queueName,
    async (job: Job<any, any, any>) => {
      try {
        queueEmitter.emit('job:started', {
          jobId: job.id,
          userId,
          jobType,
          data: job.data,
          parentId: job.data.parentId || null,
        });

        return await processor(job);
      } catch (err: any) {
        queueEmitter.emit('job:error', {
          jobId: job.id,
          userId,
          jobType,
          error: err instanceof Error ? err.message : String(err),
          parentId: job.data.parentId || null,
        });
        throw err;
      }
    },
    {
      connection: createRedisClient(),
      concurrency,
      autorun: true,
      stalledInterval: 30000,
      maxStalledCount: 2,
      lockDuration: 60000,
      drainDelay: 5,
    }
  );

  setupWorkerEvents(worker, queueName);
  workerMap.set(queueKey, worker);

  return worker;
}

/**
 * Añadir un job
 */
export async function addJob(
  jobType: JobType,
  userId: string,
  data: any,
  options?: {
    parentId?: string;
    priority?: number;
    delay?: number;
    attempts?: number;
  }
): Promise<string> {
  const q = getQueue(jobType, userId);
  const parentId = options?.parentId;
  const jobId = parentId ? `${parentId}:${uuidv4()}` : uuidv4();

  const jobData = {
    ...data,
    userId,
    parentId: parentId || null,
    createdAt: new Date().toISOString(),
  };

  logger.info(`Adding job ${jobId} to queue ${q.name}`);

  await q.add(jobType, jobData, {
    jobId,
    priority: options?.priority,
    delay: options?.delay,
    attempts: options?.attempts,
  });

  queueEmitter.emit('job:added', {
    jobId,
    userId,
    jobType,
    data: jobData,
    parentId: parentId || null,
  });

  return jobId;
}

/**
 * Añadir múltiples jobs
 */
export async function addBulkJobs(
  jobType: JobType,
  userId: string,
  dataItems: any[],
  options?: {
    parentId?: string;
    priority?: number;
    delay?: number;
    attempts?: number;
  }
) {
  const q = getQueue(jobType, userId);
  const parentId = options?.parentId || uuidv4();

  const bulk = dataItems.map((d) => {
    const jId = `${parentId}:${uuidv4()}`;
    const jobData = {
      ...d,
      userId,
      parentId,
      createdAt: new Date().toISOString(),
    };
    return {
      name: jobType,
      data: jobData,
      opts: {
        jobId: jId,
        priority: options?.priority,
        delay: options?.delay,
        attempts: options?.attempts,
      },
    };
  });

  logger.info(
    `Adding ${bulk.length} jobs with parentId ${parentId} to queue ${q.name}`
  );

  await q.addBulk(bulk);

  const jobIds = bulk.map((b) => b.opts.jobId as string);
  jobIds.forEach((id, idx) => {
    queueEmitter.emit('job:added', {
      jobId: id,
      userId,
      jobType,
      data: bulk[idx].data,
      parentId,
    });
  });

  return jobIds;
}

/**
 * Obtener un job específico
 */
export async function getJob(
  jobType: JobType,
  userId: string,
  jobId: string
): Promise<Job<any, any, any> | null> {
  const q = getQueue(jobType, userId);
  return q.getJob(jobId);
}

/**
 * Obtener jobs por parentId
 */
export async function getJobsByParentId(
  jobType: JobType,
  userId: string,
  parentId: string
): Promise<Job<any, any, any>[]> {
  const q = getQueue(jobType, userId);
  const [act, w, f, c] = await Promise.all([
    q.getJobs(['active']),
    q.getJobs(['waiting']),
    q.getJobs(['failed']),
    q.getJobs(['completed']),
  ]);
  const all = [...act, ...w, ...f, ...c];
  return all.filter((j) => j.data.parentId === parentId);
}

/**
 * Cerrar todas las colas y workers
 */
export async function closeAllQueues(): Promise<void> {
  logger.info('Closing all BullMQ queues and workers...');

  // Workers
  for (const [key, w] of workerMap.entries()) {
    logger.debug(`Closing worker for ${key}...`);
    await w.close();
  }
  workerMap.clear();

  // QueueEvents
  for (const [key, qe] of queueEventsMap.entries()) {
    logger.debug(`Closing queueEvents for ${key}...`);
    await qe.close();
  }
  queueEventsMap.clear();

  // Colas
  for (const [key, q] of queueMap.entries()) {
    logger.debug(`Closing queue ${key}...`);
    await q.close();
  }
  queueMap.clear();

  logger.info('All BullMQ resources closed');
}

export default {
  queueEmitter,
  getQueue,
  createWorker,
  addJob,
  addBulkJobs,
  getJob,
  getJobsByParentId,
  closeAllQueues,
};
