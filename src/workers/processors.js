// src/workers/processors.js
import { initializeBsky, LogLevel } from '../index.js';
import logger from '../utils/logger.js';
import { createEngagementStrategy } from '../strategies/engagementStrategy.js';

/**
 * Procesa un trabajo basicBot
 */
export async function basicBotProcessor(job) {
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

    const resumed = await atpClient.resumeSession(sessionData);
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
export async function chatBotProcessor(job) {
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

    const resumed = await atpClient.resumeSession(sessionData);
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
      } catch (error) {
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
export async function engagementBotProcessor(job) {
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

    const resumed = await atpClient.resumeSession(sessionData);
    if (!resumed) {
      throw new Error('Failed to resume session');
    }

    await job.updateProgress(30);

    const proxyInfo = await atpClient.checkProxy();
    logger.info(`Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`);

    logger.info(`Creating ${strategyType} engagement strategy...`);
    const strategy = createEngagementStrategy(
      strategyType,
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
    const results = await engagementService.executeEngagement(
      simulationResult,
      {
        timelinePosts: timelineResponse.feed,
        stopOnError: false,
        dryRun: false,
      }
    );

    // Log de cada acción
    for (let i = 0; i < results.length; i++) {
      // Aquí usamos console.log para que se capture con captureOutput: true
      console.log(`Executed ${results[i].action ?? '?'} action #${i}`);
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

export default {
  basicBotProcessor,
  chatBotProcessor,
  engagementBotProcessor,
};
