// src/services/queueService.ts
import { Queue, Worker, Job, QueueEvents, WorkerOptions } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { createRedisClient, getRedisConfig } from '../config/redis.js';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

// Importar processors directamente para evitar dependencias circulares
import {
  basicBotProcessor,
  chatBotProcessor,
  engagementBotProcessor
} from '../workers/processors.js'

// Extender la interfaz WorkerOptions para incluir captureOutput
interface ExtendedWorkerOptions extends WorkerOptions {
  captureOutput?: boolean;
}

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
 * Mapa procesadores por tipo de trabajo
 */
const processorMap: Record<JobType, (job: Job) => Promise<any>> = {
  'basicBot': basicBotProcessor,
  'chatBot': chatBotProcessor,
  'engagementBot': engagementBotProcessor
};

/**
 * Retorna clave y nombre de la cola
 */
function getQueueKey(jobType: JobType, userId: string) {
  return `${jobType}:${userId}`;
}

function getQueueName(jobType: JobType, userId: string) {
  return `bsky-${jobType}-${userId}`;
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
 * Crea o retorna una Queue y asegura que haya un worker asociado
 */
export function getQueue(jobType: JobType, userId: string): Queue {
  const queueKey = getQueueKey(jobType, userId);
  
  if (!queueMap.has(queueKey)) {
    const queueName = getQueueName(jobType, userId);
    
    // Create a specific connection for this queue
    const connection = createRedisClient();

    logger.info(`Creating queue '${queueName}' for user ${userId}`);
    
    // Log the Redis configuration being used
    const redisConfig = getRedisConfig();
    logger.debug(`Queue '${queueName}' using Redis connection:`, 
      redisConfig.url 
        ? `URL: ***REDACTED***` 
        : `Host: ${redisConfig.host}, Port: ${redisConfig.port}`
    );

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

    // QueueEvents con la misma conexión
    const queueEvents = new QueueEvents(queueName, { connection });
    setupQueueEvents(queueEvents, queueName);
    queueEventsMap.set(queueKey, queueEvents);
    
    // AUTO INICIALIZACIÓN: Crear un worker automáticamente cuando se crea una cola
    // (si no existe ya)
    if (!workerMap.has(queueKey)) {
      createWorker(jobType, userId, 3); // Usar concurrencia por defecto de 3
    }
  }

  return queueMap.get(queueKey)!;
}

/**
 * Crea Worker (o lo reemplaza)
 */
export function createWorker(
  jobType: JobType,
  userId: string,
  concurrency: number = 3
): Worker {
  const queueKey = getQueueKey(jobType, userId);
  const queueName = getQueueName(jobType, userId);
  
  // Seleccionar el procesador adecuado
  const processor = processorMap[jobType];
  if (!processor) {
    throw new Error(`No processor found for job type: ${jobType}`);
  }

  // Si existe worker previo
  if (workerMap.has(queueKey)) {
    logger.info(`Closing existing worker for queue '${queueName}'`);
    workerMap.get(queueKey)!.close();
  }

  logger.info(
    `Creating worker for queue '${queueName}' concurrency=${concurrency}`
  );

  // Create a new connection for this worker
  const connection = createRedisClient();
  
  // Log the Redis configuration being used
  const redisConfig = getRedisConfig();
  logger.debug(`Worker for '${queueName}' using Redis connection:`, 
    redisConfig.url 
      ? `URL: ***REDACTED***` 
      : `Host: ${redisConfig.host}, Port: ${redisConfig.port}`
  );

  // Usamos la interfaz extendida para incluir captureOutput
  const workerOptions: ExtendedWorkerOptions = {
    connection,
    concurrency,
    autorun: true,
    stalledInterval: 30000,
    maxStalledCount: 2,
    lockDuration: 60000,
    drainDelay: 5,
    // Habilitar captura de logs
    captureOutput: true
  };

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
    workerOptions
  );

  setupWorkerEvents(worker, queueName);
  workerMap.set(queueKey, worker);
  
  logger.info(`Worker for '${queueName}' is now active and processing jobs`);
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
  // Obtener o crear la cola (y worker automáticamente)
  const q = getQueue(jobType, userId);
  const parentId = options?.parentId;
  const jobId = parentId ? `${parentId}:${uuidv4()}` : uuidv4();

  const jobData = {
    ...data,
    userId,
    parentId: parentId ?? null,
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
    parentId: parentId ?? null,
  });

  // Asegurarse explícitamente que hay un worker para esta cola
  if (!workerMap.has(getQueueKey(jobType, userId))) {
    logger.info(`No worker found for queue ${q.name}. Creating one now...`);
    createWorker(jobType, userId);
  }

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
  // Obtener o crear la cola (y worker automáticamente)
  const q = getQueue(jobType, userId);
  const parentId = options?.parentId ?? uuidv4();

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

  // Asegurarse explícitamente que hay un worker para esta cola
  if (!workerMap.has(getQueueKey(jobType, userId))) {
    logger.info(`No worker found for queue ${q.name}. Creating one now...`);
    createWorker(jobType, userId);
  }

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
