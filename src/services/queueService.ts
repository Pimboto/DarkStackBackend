// src/services/queueService.ts
import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { createRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

// Definir tipos de trabajo
export type JobType = 'basicBot' | 'chatBot' | 'engagementBot';

// Mapa de colas por tipo y userId
const queueMap: Map<string, Queue> = new Map();
const workerMap: Map<string, Worker> = new Map();
const schedulerMap: Map<string, QueueScheduler> = new Map();
const queueEventsMap: Map<string, QueueEvents> = new Map();

// Almacenamiento para opciones de cola
interface QueueStorageOptions {
  userId: string;
  jobType: JobType;
  concurrency: number;
}
const queueOptions: Map<string, QueueStorageOptions> = new Map();

// Event emitter para eventos de cola
export const queueEmitter = new EventEmitter();

/**
 * Obtiene una clave única para una cola basada en tipo y userId
 */
function getQueueKey(jobType: JobType, userId: string): string {
  return `${jobType}:${userId}`;
}

/**
 * Construye el nombre de la cola basado en tipo y userId
 */
function getQueueName(jobType: JobType, userId: string): string {
  return `bsky:${jobType}:${userId}`;
}

/**
 * Crea o recupera una cola para un tipo de trabajo y usuario específico
 */
export function getQueue(jobType: JobType, userId: string): Queue {
  const queueKey = getQueueKey(jobType, userId);
  
  if (!queueMap.has(queueKey)) {
    const queueName = getQueueName(jobType, userId);
    const connection = createRedisClient();
    
    logger.info(`Creating queue '${queueName}' for user ${userId}`);
    
    const queueOptions = {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
          count: 3000,
        },
      }
    };

    const queue = new Queue(queueName, queueOptions);
    
    // Configurar QueueEvents para tracking en tiempo real
    const queueEvents = new QueueEvents(queueName, { connection });
    setupQueueEvents(queueEvents, queueName);
    queueEventsMap.set(queueKey, queueEvents);
    
    // Crear scheduler para manejar trabajos retrasados y repetidos
    const scheduler = new QueueScheduler(queueName, { connection });
    schedulerMap.set(queueKey, scheduler);
    
    queueMap.set(queueKey, queue);
  }
  
  return queueMap.get(queueKey)!;
}

/**
 * Crea un nuevo worker para una cola específica
 */
export function createWorker(
  jobType: JobType, 
  userId: string, 
  concurrency: number, 
  processor: (job: Job) => Promise<any>
): Worker {
  const queueKey = getQueueKey(jobType, userId);
  const queueName = getQueueName(jobType, userId);
  
  // Almacenar opciones para futuras referencias
  queueOptions.set(queueKey, { userId, jobType, concurrency });
  
  // Si ya existe un worker para esta cola, desconectarlo primero
  if (workerMap.has(queueKey)) {
    logger.info(`Closing existing worker for queue '${queueName}'`);
    workerMap.get(queueKey)!.close();
  }
  
  logger.info(`Creating worker for queue '${queueName}' with concurrency ${concurrency}`);
  
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      try {
        // Emitir evento de inicio
        queueEmitter.emit('job:started', { 
          jobId: job.id, 
          userId, 
          jobType, 
          data: job.data,
          parentId: job.data.parentId || null
        });
        
        // Procesar trabajo
        return await processor(job);
      } catch (error) {
        // Emitir evento de error
        queueEmitter.emit('job:error', {
          jobId: job.id,
          userId,
          jobType,
          error: error instanceof Error ? error.message : String(error),
          parentId: job.data.parentId || null
        });
        throw error; // Re-lanzar para que BullMQ maneje reintentos
      }
    },
    {
      connection: createRedisClient(),
      concurrency,
      autorun: true,
      // Mejorar la estabilidad del worker
      stalledInterval: 30000,      // Verificar trabajos estancados cada 30s
      maxStalledCount: 2,          // Marcar como estancado después de 2 verificaciones
      lockDuration: 60000,         // Mantener bloqueo por 1 minuto por defecto
      drainDelay: 5,               // Pequeño retraso al drenar la cola
    }
  );
  
  // Configurar manejadores de eventos para worker
  setupWorkerEvents(worker, queueName);
  
  workerMap.set(queueKey, worker);
  return worker;
}

/**
 * Configura listeners de eventos para QueueEvents
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
    logger.debug(`[${queueName}] Job ${jobId} progress: ${progress}%`);
  });
}

/**
 * Configura listeners de eventos para Worker
 */
function setupWorkerEvents(worker: Worker, queueName: string): void {
  worker.on('error', (error) => {
    logger.error(`[${queueName}] Worker error:`, error);
    queueEmitter.emit('worker:error', { queueName, error: error.message });
  });
  
  worker.on('failed', (job, error) => {
    if (job) {
      logger.error(`[${queueName}] Job ${job.id} failed:`, error);
      queueEmitter.emit('job:failed', { 
        jobId: job.id, 
        error: error.message, 
        queueName,
        parentId: job.data.parentId || null
      });
    }
  });
  
  worker.on('stalled', (jobId) => {
    logger.warn(`[${queueName}] Job ${jobId} stalled`);
    queueEmitter.emit('job:stalled', { jobId, queueName });
  });
}

/**
 * Añade un trabajo a la cola
 */
export async function addJob(
  jobType: JobType, 
  userId: string, 
  data: any, 
  options: {
    parentId?: string,
    priority?: number,
    delay?: number,
    attempts?: number
  } = {}
): Promise<string> {
  const queue = getQueue(jobType, userId);
  
  // Generar ID único para este trabajo
  const jobId = options.parentId ? `${options.parentId}:${uuidv4()}` : uuidv4();
  
  // Añadir parentId a los datos si existe
  const jobData = {
    ...data,
    userId,
    parentId: options.parentId || null,
    createdAt: new Date().toISOString()
  };
  
  logger.info(`Adding job ${jobId} to queue ${queue.name}`);
  
  // Añadir trabajo a la cola con opciones
  await queue.add(jobType, jobData, {
    jobId,
    priority: options.priority || undefined,
    delay: options.delay || undefined,
    attempts: options.attempts || undefined,
  });
  
  // Emitir evento de trabajo añadido
  queueEmitter.emit('job:added', { 
    jobId, 
    userId, 
    jobType, 
    data: jobData,
    parentId: options.parentId || null
  });
  
  return jobId;
}

/**
 * Añade múltiples trabajos a la cola con un mismo parentId
 */
export async function addBulkJobs(
  jobType: JobType,
  userId: string,
  dataItems: any[],
  options: {
    parentId?: string,
    priority?: number,
    delay?: number,
    attempts?: number
  } = {}
): Promise<string[]> {
  const queue = getQueue(jobType, userId);
  
  // Generar un parentId si no se proporcionó
  const parentId = options.parentId || uuidv4();
  
  const jobIdsAndData = dataItems.map(data => {
    const jobId = `${parentId}:${uuidv4()}`;
    const jobData = {
      ...data,
      userId,
      parentId,
      createdAt: new Date().toISOString()
    };
    
    return {
      name: jobType,
      data: jobData,
      opts: {
        jobId,
        priority: options.priority || undefined,
        delay: options.delay || undefined,
        attempts: options.attempts || undefined,
      }
    };
  });
  
  logger.info(`Adding ${jobIdsAndData.length} jobs with parentId ${parentId} to queue ${queue.name}`);
  
  // Añadir trabajos en bloque
  await queue.addBulk(jobIdsAndData);
  
  // Emitir eventos para cada trabajo
  const jobIds = jobIdsAndData.map(item => item.opts.jobId);
  jobIds.forEach((jobId, index) => {
    queueEmitter.emit('job:added', {
      jobId,
      userId,
      jobType,
      data: jobIdsAndData[index].data,
      parentId
    });
  });
  
  return jobIds;
}

/**
 * Obtiene información sobre un trabajo
 */
export async function getJob(jobType: JobType, userId: string, jobId: string): Promise<Job | null> {
  const queue = getQueue(jobType, userId);
  return await queue.getJob(jobId);
}

/**
 * Obtiene trabajos por parentId
 */
export async function getJobsByParentId(jobType: JobType, userId: string, parentId: string): Promise<Job[]> {
  const queue = getQueue(jobType, userId);
  
  // Obtenemos todos los trabajos en la cola (activos, esperando, fallados, completados)
  const jobs = await Promise.all([
    queue.getJobs(['active']),
    queue.getJobs(['waiting']),
    queue.getJobs(['failed']),
    queue.getJobs(['completed'])
  ]).then(results => results.flat());
  
  // Filtrar por parentId
  return jobs.filter(job => job.data.parentId === parentId);
}

/**
 * Cierra todas las conexiones de cola
 */
export async function closeAllQueues(): Promise<void> {
  logger.info('Closing all BullMQ queues and workers...');
  
  // Cerrar todos los workers
  for (const [key, worker] of workerMap.entries()) {
    logger.debug(`Closing worker for ${key}...`);
    await worker.close();
  }
  workerMap.clear();
  
  // Cerrar todos los schedulers
  for (const [key, scheduler] of schedulerMap.entries()) {
    logger.debug(`Closing scheduler for ${key}...`);
    await scheduler.close();
  }
  schedulerMap.clear();
  
  // Cerrar todos los queueEvents
  for (const [key, queueEvents] of queueEventsMap.entries()) {
    logger.debug(`Closing queueEvents for ${key}...`);
    await queueEvents.close();
  }
  queueEventsMap.clear();
  
  // Cerrar todas las colas
  for (const [key, queue] of queueMap.entries()) {
    logger.debug(`Closing queue ${key}...`);
    await queue.close();
  }
  queueMap.clear();
  
  logger.info('All BullMQ resources closed');
}

export default {
  getQueue,
  createWorker,
  addJob,
  addBulkJobs,
  getJob,
  getJobsByParentId,
  closeAllQueues,
  queueEmitter
};
