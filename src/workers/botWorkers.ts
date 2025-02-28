// src/workers/botWorkers.ts
import { createWorker, JobType } from '../services/queueService.ts';
import logger from '../utils/logger.ts';

/**
 * Crea los 3 workers para un userId
 */
export function createBotWorkers(userId: string, concurrency = 5): void {
  logger.info(`Creating bot workers for user ${userId}, concurrency=${concurrency}`);
  const botTypes: JobType[] = ['basicBot', 'chatBot', 'engagementBot'];

  for (const bt of botTypes) {
    // Usar createWorker de queueService que ya tiene lógica de selección de procesador
    createWorker(bt, userId, concurrency);
  }

  logger.info(`Workers created for user ${userId}`);
}

/**
 * Inicializa workers para varios usuarios
 */
export function initializeWorkers(userIds: string[], concurrency = 5): void {
  logger.info(`Initializing workers for ${userIds.length} users`);
  for (const userId of userIds) {
    createBotWorkers(userId, concurrency);
  }
  logger.info('All workers initialized');
}

export default {
  createBotWorkers,
  initializeWorkers
};
