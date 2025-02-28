// src/workers/botWorkers.ts
import { Job } from "bullmq";
import { createWorker, JobType } from "../services/queueService.js";
import { initializeBsky, LogLevel } from "../index.js";
import logger from "../utils/logger.js";
import { SessionData } from "../types/index.js";
import { createEngagementStrategy } from "../strategies/engagementStrategy.js";

/**
 * Procesa un trabajo del bot básico
 */

interface EngagementResult {
  success: boolean;
  action?: string;
  postUri?: string;
  postCid?: string;
  error?: Error;
}

async function basicBotProcessor(job: Job): Promise<any> {
  logger.info(`Processing basicBot job ${job.id}`);

  // Actualizar progreso
  await job.updateProgress(10);

  try {
    const { sessionData, message } = job.data;

    // Validar datos necesarios
    if (!sessionData) {
      throw new Error("No session data provided in job");
    }

    // Inicializar el cliente de Bluesky con la sesión existente
    const { atpClient, postService } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false, // No iniciamos sesión automáticamente ya que usaremos los datos de sesión proporcionados
    });

    // Actualizar progreso
    await job.updateProgress(30);

    // Reanudar sesión
    const resumed = await atpClient.resumeSession(sessionData as SessionData);
    if (!resumed) {
      throw new Error("Failed to resume session");
    }

    // Actualizar progreso
    await job.updateProgress(50);

    // Verificar proxy
    const proxyInfo = await atpClient.checkProxy();
    logger.info(
      `Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`
    );

    // Crear post si se proporciona mensaje
    let postResult = null;
    if (message) {
      // Actualizar progreso
      await job.updateProgress(70);
      postResult = await postService.createPost(message, {
        includeTimestamp: true,
      });
      logger.info(`Post created: ${postResult.uri}`);
    }

    // Obtener timeline
    await job.updateProgress(90);
    const timeline = await atpClient.getTimeline(5);

    // Completado
    await job.updateProgress(100);

    return {
      success: true,
      message: "Basic bot job completed successfully",
      postResult,
      timelineCount: timeline.feed.length,
      proxy: proxyInfo,
    };
  } catch (error) {
    logger.error(`Error in basicBot job ${job.id}:`, error);
    throw error; // Relanzar el error para que BullMQ lo maneje
  }
}

/**
 * Procesa un trabajo del bot de chat
 */
async function chatBotProcessor(job: Job): Promise<any> {
  logger.info(`Processing chatBot job ${job.id}`);

  // Actualizar progreso
  await job.updateProgress(10);

  try {
    const { sessionData, messages, recipients } = job.data;

    // Validar datos necesarios
    if (!sessionData) {
      throw new Error("No session data provided in job");
    }

    if (!messages || messages.length === 0) {
      throw new Error("No messages provided in job");
    }

    if (!recipients || recipients.length === 0) {
      throw new Error("No recipients provided in job");
    }

    // Inicializar el cliente de Bluesky con la sesión existente y chat habilitado
    const { atpClient, chatService } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false,
      enableChat: true,
    });

    // Actualizar progreso
    await job.updateProgress(30);

    // Reanudar sesión
    const resumed = await atpClient.resumeSession(sessionData as SessionData);
    if (!resumed) {
      throw new Error("Failed to resume session");
    }

    // Actualizar progreso
    await job.updateProgress(50);

    // Verificar proxy
    const proxyInfo = await atpClient.checkProxy();
    logger.info(
      `Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`
    );

    // Enviar mensajes a cada destinatario
    const results = [];
    let progressIncrement = 40 / recipients.length;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const message =
        typeof messages === "string" ? messages : messages[i % messages.length];

      try {
        logger.info(`Starting conversation with ${recipient}...`);
        const conversation = await chatService!.startConversation(recipient);

        logger.info(`Sending message to ${recipient}...`);
        await chatService!.sendMessage(conversation, message);

        results.push({
          recipient,
          success: true,
          message: `Message sent successfully to ${recipient}`,
        });
      } catch (error) {
        logger.error(`Error sending message to ${recipient}:`, error);
        results.push({
          recipient,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Actualizar progreso incremental
      await job.updateProgress(50 + (i + 1) * progressIncrement);
    }

    // Completado
    await job.updateProgress(100);

    return {
      success: true,
      message: "Chat bot job completed",
      results,
      proxy: proxyInfo,
    };
  } catch (error) {
    logger.error(`Error in chatBot job ${job.id}:`, error);
    throw error;
  }
}

/**
 * Procesa un trabajo del bot de engagement
 */
async function engagementBotProcessor(job: Job): Promise<any> {
  logger.info(`Processing engagementBot job ${job.id}`);

  // Actualizar progreso
  await job.updateProgress(10);

  try {
    const {
      sessionData,
      engagementOptions = {},
      strategyType = "human-like",
    } = job.data;

    // Validar datos necesarios
    if (!sessionData) {
      throw new Error("No session data provided in job");
    }

    // Inicializar el cliente de Bluesky con la sesión existente
    const { atpClient, engagementService } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false,
    });

    // Actualizar progreso
    await job.updateProgress(20);

    // Reanudar sesión
    const resumed = await atpClient.resumeSession(sessionData as SessionData);
    if (!resumed) {
      throw new Error("Failed to resume session");
    }

    // Actualizar progreso
    await job.updateProgress(30);

    // Verificar proxy
    const proxyInfo = await atpClient.checkProxy();
    logger.info(
      `Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`
    );

    // Crear estrategia de engagement
    logger.info(`Creating ${strategyType} engagement strategy...`);
    const strategy = createEngagementStrategy(
      strategyType as "random" | "human-like",
      engagementOptions
    );

    // Simular plan de engagement
    await job.updateProgress(40);
    logger.info("Simulating engagement actions...");
    const simulationResult = strategy.simulate();

    // Obtener timeline
    await job.updateProgress(50);
    const timelineResponse = await atpClient.getTimeline(
      Math.max(100, simulationResult.plannedActions.length * 2)
    );

    // Actualizar progreso con webhook para seguimiento en tiempo real
    let processedActions = 0;
    const reportProgress = async () => {
      const progressPercentage =
        50 +
        Math.floor(
          (processedActions / simulationResult.plannedActions.length) * 50
        );
      await job.updateProgress(progressPercentage);
      return {
        current: processedActions,
        total: simulationResult.plannedActions.length,
      };
    };

    // Configurar callback de progreso
    const progressCallback = async (action: any, index: number) => {
      processedActions++;
      if (
        processedActions % 5 === 0 ||
        processedActions === simulationResult.plannedActions.length
      ) {
        await reportProgress();
      }

      // Reportar acción individual para WebSocket
      job.log(`Executed ${action.type} action on post #${index}`);
    };

    // Ejecutar acciones
    logger.info("Executing engagement actions...");
    const results = await engagementService.executeEngagement(
      simulationResult,
      {
        timelinePosts: timelineResponse.feed,
        stopOnError: false,
        dryRun: false,
        progressCallback, // Añadir callback de progreso
      }
    );

    // Completado
    await job.updateProgress(100);

    // Calcular estadísticas
    const successCount = results.filter(
      (r: EngagementResult) => r.success
    ).length;
    const likeCount = results.filter(
      (r: EngagementResult) => r.success && r.action === "like"
    ).length;
    const repostCount = results.filter(
      (r: EngagementResult) => r.success && r.action === "repost"
    ).length;
    const errorCount = results.filter(
      (r: EngagementResult) => !r.success
    ).length;

    return {
      success: true,
      message: "Engagement bot job completed",
      stats: {
        totalActions: simulationResult.plannedActions.length,
        successCount,
        likeCount,
        repostCount,
        errorCount,
      },
      proxy: proxyInfo,
    };
  } catch (error) {
    logger.error(`Error in engagementBot job ${job.id}:`, error);
    throw error;
  }
}

/**
 * Crea workers para un usuario específico
 */
export function createBotWorkers(
  userId: string,
  concurrency: number = 5
): void {
  logger.info(
    `Creating bot workers for user ${userId} with concurrency ${concurrency}`
  );

  // Crear worker para basicBot
  createWorker("basicBot", userId, concurrency, basicBotProcessor);

  // Crear worker para chatBot
  createWorker("chatBot", userId, concurrency, chatBotProcessor);

  // Crear worker para engagementBot
  createWorker("engagementBot", userId, concurrency, engagementBotProcessor);

  logger.info(`Workers created for user ${userId}`);
}

/**
 * Inicializa todos los workers para un conjunto de usuarios
 */
export function initializeWorkers(
  userIds: string[],
  concurrency: number = 5
): void {
  logger.info(`Initializing workers for ${userIds.length} users`);

  userIds.forEach((userId) => {
    createBotWorkers(userId, concurrency);
  });

  logger.info("All workers initialized");
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
