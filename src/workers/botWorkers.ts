// src/workers/botWorkers.ts
import { Job } from 'bullmq';
import { createWorker, JobType } from '../services/queueService.ts';
import { initializeBsky, LogLevel } from '../index.ts';
import logger from '../utils/logger.ts';
import { SessionData } from '../types/index.ts';
import { createEngagementStrategy } from '../strategies/engagementStrategy.ts';

interface EngagementResult {
  success: boolean;
  action?: string;
  postUri?: string;
  postCid?: string;
  error?: Error;
}

/**
 * Procesa un trabajo basicBot
 */
async function basicBotProcessor(job: Job<any, any, any>): Promise<any> {
  logger.info(`Processing basicBot job ${job.id}`);
  await job.updateProgress(10);

  try {
    const { sessionData, message } = job.data;
    if (!sessionData) {
      throw new Error('No session data provided in job');
    }

    const { atpClient, postService } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false,
    });

    await job.updateProgress(30);

    const resumed = await atpClient.resumeSession(sessionData as SessionData);
    if (!resumed) {
      throw new Error('Failed to resume session');
    }

    await job.updateProgress(50);

    const proxyInfo = await atpClient.checkProxy();
    logger.info(`Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`);

    let postResult = null;
    if (message) {
      await job.updateProgress(70);
      postResult = await postService.createPost(message, { includeTimestamp: true });
      logger.info(`Post created: ${postResult.uri}`);
    }

    await job.updateProgress(90);
    const timeline = await atpClient.getTimeline(5);

    await job.updateProgress(100);

    return {
      success: true,
      message: 'Basic bot job completed successfully',
      postResult,
      timelineCount: timeline.feed.length,
      proxy: proxyInfo,
    };
  } catch (err) {
    logger.error(`Error in basicBot job ${job.id}:`, err);
    throw err;
  }
}

/**
 * Procesa un trabajo chatBot
 */
async function chatBotProcessor(job: Job<any, any, any>): Promise<any> {
  logger.info(`Processing chatBot job ${job.id}`);
  await job.updateProgress(10);

  try {
    const { sessionData, messages, recipients } = job.data;
    if (!sessionData) {
      throw new Error('No session data provided in job');
    }
    if (!messages || messages.length === 0) {
      throw new Error('No messages provided in job');
    }
    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided in job');
    }

    const { atpClient, chatService } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false,
      enableChat: true,
    });

    await job.updateProgress(30);

    const resumed = await atpClient.resumeSession(sessionData as SessionData);
    if (!resumed) {
      throw new Error('Failed to resume session');
    }

    await job.updateProgress(50);

    const proxyInfo = await atpClient.checkProxy();
    logger.info(`Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`);

    if (!chatService) {
      throw new Error('No chatService initialized');
    }

    const results = [];
    const progressIncrement = 40 / recipients.length;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const msg =
        typeof messages === 'string' ? messages : messages[i % messages.length];

      try {
        logger.info(`Starting conversation with ${recipient}...`);
        const conversation = await chatService.startConversation(recipient);

        logger.info(`Sending message to ${recipient}...`);
        await chatService.sendMessage(conversation, msg);

        results.push({ recipient, success: true, message: `Message sent to ${recipient}` });
      } catch (error: any) {
        logger.error(`Error sending message to ${recipient}:`, error);
        results.push({
          recipient,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await job.updateProgress(50 + (i + 1) * progressIncrement);
    }

    await job.updateProgress(100);

    return {
      success: true,
      message: 'Chat bot job completed',
      results,
      proxy: proxyInfo,
    };
  } catch (err) {
    logger.error(`Error in chatBot job ${job.id}:`, err);
    throw err;
  }
}

/**
 * Procesa un trabajo engagementBot
 */
async function engagementBotProcessor(job: Job<any, any, any>): Promise<any> {
  logger.info(`Processing engagementBot job ${job.id}`);
  await job.updateProgress(10);

  try {
    const { sessionData, engagementOptions = {}, strategyType = 'human-like' } = job.data;
    if (!sessionData) {
      throw new Error('No session data provided in job');
    }

    const { atpClient, engagementService } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false,
    });

    await job.updateProgress(20);

    const resumed = await atpClient.resumeSession(sessionData as SessionData);
    if (!resumed) {
      throw new Error('Failed to resume session');
    }

    await job.updateProgress(30);

    const proxyInfo = await atpClient.checkProxy();
    logger.info(`Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`);

    logger.info(`Creating ${strategyType} engagement strategy...`);
    const strategy = createEngagementStrategy(
      strategyType as 'random' | 'human-like',
      engagementOptions
    );

    await job.updateProgress(40);
    logger.info('Simulating engagement actions...');
    const simulationResult = strategy.simulate();

    await job.updateProgress(50);
    const timelineResponse = await atpClient.getTimeline(
      Math.max(100, simulationResult.plannedActions.length * 2)
    );

    let processedActions = 0;
    const totalActions = simulationResult.plannedActions.length;

    // Helper para reportar porcentaje
    const reportActionProgress = async () => {
      processedActions++;
      const percentage = 50 + Math.floor((processedActions / totalActions) * 50);
      await job.updateProgress(percentage);
    };

    logger.info('Executing engagement actions...');
    const results: EngagementResult[] = await engagementService.executeEngagement(
      simulationResult,
      {
        timelinePosts: timelineResponse.feed,
        stopOnError: false,
        dryRun: false,
      }
    );

    // Log de cada acción
    for (let i = 0; i < results.length; i++) {
      await job.log(`Executed ${results[i].action || '?'} action #${i}`);
      await reportActionProgress();
    }

    await job.updateProgress(100);

    const successCount = results.filter((r) => r.success).length;
    const likeCount = results.filter((r) => r.success && r.action === 'like').length;
    const repostCount = results.filter((r) => r.success && r.action === 'repost').length;
    const errorCount = results.filter((r) => !r.success).length;

    return {
      success: true,
      message: 'Engagement bot job completed',
      stats: {
        totalActions,
        successCount,
        likeCount,
        repostCount,
        errorCount,
      },
      proxy: proxyInfo,
    };
  } catch (err) {
    logger.error(`Error in engagementBot job ${job.id}:`, err);
    throw err;
  }
}

/**
 * Crea los 3 workers para un userId
 */
export function createBotWorkers(userId: string, concurrency = 5): void {
  logger.info(`Creating bot workers for user ${userId}, concurrency=${concurrency}`);
  const botTypes: JobType[] = ['basicBot', 'chatBot', 'engagementBot'];

  for (const bt of botTypes) {
    const processor =
      bt === 'basicBot'
        ? basicBotProcessor
        : bt === 'chatBot'
        ? chatBotProcessor
        : engagementBotProcessor;

    createWorker(bt, userId, concurrency, processor);
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
  initializeWorkers,
  processors: {
    basicBotProcessor,
    chatBotProcessor,
    engagementBotProcessor,
  },
};
