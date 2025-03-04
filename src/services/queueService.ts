// src/services/queueService.ts
import { Queue, Worker, Job, QueueEvents, WorkerOptions } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { getRedisConfig, getSharedRedisConnection } from '../config/redis.ts';
import logger from '../utils/logger.ts';
import { EventEmitter } from 'events';
import { emitJobEvent } from './socketService.ts';

// Importar processors directamente para evitar dependencias circulares
import {
  basicBotProcessor,
  chatBotProcessor,
  engagementBotProcessor
} from '../workers/processors.ts'

// Extender la interfaz WorkerOptions para incluir captureOutput
interface ExtendedWorkerOptions extends WorkerOptions {
  captureOutput?: boolean;
}

/**
 * Interfaz para mensajes de log capturados
 */
export interface JobLog {
  timestamp: string;
  message: string;
  level: 'info' | 'error' | 'debug' | 'warn';
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
    const eventData = { jobId, result, queueName };
    
    // Emitir evento internamente
    queueEmitter.emit('job:completed', eventData);
    
    // Emitir evento a través de WebSockets
    emitJobEvent('job:completed', {
      ...eventData,
      userId: queueName.split('-').pop() || '',
    });
    
    logger.debug(`[${queueName}] Job ${jobId} completed`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    const eventData = { jobId, error: failedReason, queueName };
    
    // Emitir evento internamente
    queueEmitter.emit('job:failed', eventData);
    
    // Emitir evento a través de WebSockets
    emitJobEvent('job:failed', {
      ...eventData,
      userId: queueName.split('-').pop() || '',
    });
    
    logger.error(`[${queueName}] Job ${jobId} failed: ${failedReason}`);
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    const progress = typeof data === 'string' ? parseInt(data, 10) : data;
    const eventData = { jobId, progress, queueName };
    
    // Emitir evento internamente
    queueEmitter.emit('job:progress', eventData);
    
    // Emitir evento a través de WebSockets
    emitJobEvent('job:progress', {
      ...eventData,
      userId: queueName.split('-').pop() || '',
    });
    
    logger.debug(`[${queueName}] Job ${jobId} progress: ${progress}`);
  });
}

/**
 * Configura eventos Worker
 */
function setupWorkerEvents(worker: Worker, queueName: string): void {
  const userId = queueName.split('-').pop() || '';
  
  worker.on('error', (err) => {
    logger.error(`[${queueName}] Worker error:`, err);
    
    const eventData = { queueName, error: err.message };
    
    // Emitir evento internamente
    queueEmitter.emit('worker:error', eventData);
    
    // Emitir evento a través de WebSockets
    emitJobEvent('worker:error', {
      ...eventData,
      userId
    });
  });

  worker.on('failed', (job, err) => {
    if (job) {
      logger.error(`[${queueName}] Job ${job.id} failed:`, err);
      
      const eventData = {
        jobId: job.id,
        error: err.message,
        queueName,
        parentId: job.data.parentId || null,
      };
      
      // Emitir evento internamente
      queueEmitter.emit('job:failed', eventData);
      
      // Emitir evento a través de WebSockets
      emitJobEvent('job:failed', {
        ...eventData,
        userId
      });
    }
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[${queueName}] Job ${jobId} stalled`);
    
    const eventData = { jobId, queueName };
    
    // Emitir evento internamente
    queueEmitter.emit('job:stalled', eventData);
    
    // Emitir evento a través de WebSockets
    emitJobEvent('job:stalled', {
      ...eventData,
      userId
    });
  });
}

/**
 * Crea o retorna una Queue y asegura que haya un worker asociado
 */
export function getQueue(jobType: JobType, userId: string): Queue {
  const queueKey = getQueueKey(jobType, userId);
  
  if (!queueMap.has(queueKey)) {
    const queueName = getQueueName(jobType, userId);
    
    // Usar la conexión compartida Redis para todas las colas
    // Esto mejora el rendimiento y reduce la sobrecarga de conexiones
    const connection = getSharedRedisConnection();

    logger.info(`Creating queue '${queueName}' for user ${userId}`);
    
    // Log the Redis configuration being used
    const redisConfig = getRedisConfig();
    logger.debug(`Queue '${queueName}' using shared Redis connection:`,
      redisConfig.url
        ? `URL: ***REDACTED***`
        : `Host: ${redisConfig.host}, Port: ${redisConfig.port}`
    );

    const queueOpts = {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        // Implementar limpieza automática: trabajos completados se eliminan después de 1 día o cuando hay más de 1000
        removeOnComplete: { age: 86400, count: 1000 },
        // Trabajos fallidos se mantienen más tiempo (7 días) para diagnóstico
        removeOnFail: { age: 604800, count: 3000 },
      },
    };

    const queue = new Queue(queueName, queueOpts);
    queueMap.set(queueKey, queue);

    // QueueEvents con la misma conexión compartida
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
 * Helper para añadir un log al job
 */
async function addJobLog(job: Job, level: 'info' | 'error' | 'debug' | 'warn', message: string): Promise<void> {
  if (!job || !job.id) return;
  
  const timestamp = new Date().toISOString();
  const logEntry: JobLog = {
    timestamp,
    level,
    message,
  };

  // Inicializar array de logs si no existe
  const logs = job.data.logs || [];
  logs.push(logEntry);

  // Actualizar el job con el nuevo log
  await job.updateData({
    ...job.data,
    logs,
  });

  // Preparar datos del evento
  const eventData = {
    jobId: job.id,
    userId: job.data.userId,
    log: logEntry,
    parentId: job.data.parentId || null,
    jobType: job.name,
  };

  // Emitir evento interno
  queueEmitter.emit('job:log', eventData);
  
  // Emitir evento de log vía WebSockets
  emitJobEvent('job:log', eventData);
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

  // Usar la conexión compartida para todos los workers
  const connection = getSharedRedisConnection();
  
  // Log the Redis configuration being used
  const redisConfig = getRedisConfig();
  logger.debug(`Worker for '${queueName}' using shared Redis connection:`,
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
    // Habilitar captura de logs de consola
    captureOutput: true
  };

  const worker = new Worker(
    queueName,
    async (job: Job<any, any, any>) => {
      try {
        // Inicializar array de logs en job.data si no existe
        if (!job.data.logs) {
          await job.updateData({
            ...job.data,
            logs: [],
          });
        }

        // Añadir log de inicio
        await addJobLog(job, 'info', `Starting ${jobType} job ${job.id}`);

        queueEmitter.emit('job:started', {
          jobId: job.id,
          userId,
          jobType,
          data: job.data,
          parentId: job.data.parentId || null,
        });

        // Interceptar console.log, console.error, etc. y capturarlos como logs del job
        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;
        const originalConsoleDebug = console.debug;

        // Redefinir console.log para capturar en logs del job
        console.log = (...args: any[]) => {
          const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          
          // Llamar al original
          originalConsoleLog.apply(console, args);
          
          // Añadir a logs del job (sin await para no bloquear)
          addJobLog(job, 'info', message).catch(err =>
            originalConsoleError(`Error adding job log: ${err}`)
          );
        };

        console.error = (...args: any[]) => {
          const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          
          originalConsoleError.apply(console, args);
          addJobLog(job, 'error', message).catch(err =>
            originalConsoleError(`Error adding job log: ${err}`)
          );
        };

        console.warn = (...args: any[]) => {
          const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          
          originalConsoleWarn.apply(console, args);
          addJobLog(job, 'warn', message).catch(err =>
            originalConsoleError(`Error adding job log: ${err}`)
          );
        };

        console.debug = (...args: any[]) => {
          const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          
          originalConsoleDebug.apply(console, args);
          addJobLog(job, 'debug', message).catch(err =>
            originalConsoleError(`Error adding job log: ${err}`)
          );
        };

        try {
          // Llamar al procesador con el job
          const result = await processor(job);
          
          // Añadir log de finalización exitosa
          await addJobLog(job, 'info', `Job ${job.id} completed successfully`);
          
          return result;
        } finally {
          // Restaurar console.log original
          console.log = originalConsoleLog;
          console.error = originalConsoleError;
          console.warn = originalConsoleWarn;
          console.debug = originalConsoleDebug;
        }
      } catch (err: any) {
        // Log del error
        const errorMessage = err instanceof Error ? err.message : String(err);
        await addJobLog(job, 'error', `Job failed: ${errorMessage}`);
        
        queueEmitter.emit('job:error', {
          jobId: job.id,
          userId,
          jobType,
          error: errorMessage,
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
