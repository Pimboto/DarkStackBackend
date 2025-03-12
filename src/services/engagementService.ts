// src/services/engagementService.ts
import AtpClient from "../core/atpClient.ts";
import {
  EngagementOptions,
  ActionType,
  PlannedAction,
  SimulationResult,
  EngagementResult,
  TimelinePost,
  FeedType,
} from "../types/index.ts";
import { getEngagementConfig } from "../config/config.ts";
import { getRandomInt } from "../utils/random.ts";
import { sleep } from "../utils/delay.ts";
import logger from "../utils/logger.ts";

/**
 * Interfaz para funciones de logger personalizadas
 */
export interface LoggerFunctions {
  info: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Servicio para simular y ejecutar acciones de engagement (likes, reposts)
 */
class EngagementService {
  private logFns: LoggerFunctions;

  /**
   * Crea una nueva instancia del servicio de engagement
   * @param atpClient Cliente ATP para realizar las acciones
   * @param customLogger Funciones de logger personalizadas (opcional)
   */
  constructor(
    private readonly atpClient: AtpClient,
    customLogger?: LoggerFunctions
  ) {
    // Si se proporciona un logger personalizado, usarlo, de lo contrario usar el predeterminado
    this.logFns = customLogger || {
      info: logger.info.bind(logger),
      debug: logger.debug.bind(logger),
      warn: logger.warn.bind(logger),
      error: logger.error.bind(logger),
    };
  }

  /**
   * Simula un plan de acciones de engagement
   * @param options Opciones de configuración para la simulación
   * @returns Resultado de la simulación
   */
  simulateEngagement(
    options: Partial<EngagementOptions> = {}
  ): SimulationResult {
    const config = getEngagementConfig();

    // Aplicar valores por defecto
    const numberOfActions = options.numberOfActions ?? 10;
    const delayRange = options.delayRange ?? config.defaultDelayRange;
    const skipRange = options.skipRange ?? config.defaultSkipRange;
    const likePercentage =
      options.likePercentage ?? config.defaultLikePercentage;

    this.logFns.info(
      `Simulating ${numberOfActions} engagement actions (${likePercentage}% likes)...`
    );

    // Calcular número de likes y reposts
    const likeCount = Math.floor(numberOfActions * (likePercentage / 100));
    const repostCount = numberOfActions - likeCount;

    // Generar acciones planificadas
    const plannedActions: PlannedAction[] = [];
    let totalTime = 0;

    for (let i = 0; i < numberOfActions; i++) {
      // Determinar tipo de acción
      const type: ActionType = i < likeCount ? "like" : "repost";

      // Generar delay y skip aleatorios
      const delay = getRandomInt(delayRange[0], delayRange[1]);
      const skip = getRandomInt(skipRange[0], skipRange[1]);

      plannedActions.push({
        type,
        delay,
        skip,
        index: i,
      });

      totalTime += delay;

      this.logFns.debug(
        `Planned action ${i + 1}: ${type}, Delay = ${delay}s, Skip = ${skip}`
      );
    }

    this.logFns.info(`Simulation complete. Total time: ${totalTime}s`);
    this.logFns.info(`Actions: ${likeCount} likes, ${repostCount} reposts`);

    return {
      plannedActions,
      totalTime,
      likeCount,
      repostCount,
    };
  }

  /**
   * Ejecuta un plan de acciones de engagement
   * @param simulationResult Resultado de una simulación previa
   * @param options Opciones adicionales para la ejecución
   * @returns Promise con el resultado de la ejecución
   */
  async executeEngagement(
    simulationResult: SimulationResult,
    options: {
      dryRun?: boolean;
      stopOnError?: boolean;
      timelinePosts?: TimelinePost[];
      progressCallback?: (
        action: PlannedAction,
        index: number
      ) => Promise<void>;
      feedType?: FeedType;
    } = {}
  ): Promise<EngagementResult[]> {
    const { plannedActions } = simulationResult;
    const {
      dryRun = false,
      stopOnError = false,
      progressCallback,
      feedType = FeedType.WHATS_HOT  // Default to What's Hot feed
    } = options;

    // Obtener posts del timeline o feed especificado si no se proporcionaron
    let posts;
    if (options.timelinePosts) {
      posts = options.timelinePosts;
      this.logFns.info("Using provided posts for engagement");
    } else {
      const limit = Math.min(100, plannedActions.length * 2);
      
      if (feedType === FeedType.WHATS_HOT) {
        this.logFns.info(`Getting posts from What's Hot feed (limit: ${limit})...`);
        posts = (await this.atpClient.getWhatsHotFeed(limit)).feed;
      } else {
        this.logFns.info(`Getting posts from timeline (limit: ${limit})...`);
        posts = (await this.atpClient.getTimeline(limit)).feed;
      }
    }

    if (!posts || posts.length === 0) {
      throw new Error("No posts available for engagement actions");
    }

    this.logFns.info(`Retrieved ${posts.length} posts for engagement actions`);
    const timelinePosts = posts;

    this.logFns.info(
      `Starting execution of ${plannedActions.length} engagement actions (${
        dryRun ? "DRY RUN" : "REAL EXECUTION"
      })...`
    );

    const results: EngagementResult[] = [];
    let currentPostIndex = 0;

    // Ejecutar cada acción
    for (let i = 0; i < plannedActions.length; i++) {
      const action = plannedActions[i];
      try {
        this.logFns.info(
          `Executing action ${action.index + 1}: ${action.type} (delay: ${
            action.delay
          }s, skip: ${action.skip})`
        );

        // Esperar el delay
        await sleep(action.delay * 1000);

        // Avanzar posts
        currentPostIndex += action.skip;
        if (currentPostIndex >= timelinePosts.length) {
          currentPostIndex = timelinePosts.length - 1;
          this.logFns.warn(
            `Skip value too high, using last available post (index: ${currentPostIndex})`
          );
        }

        // Obtenemos el feedItem
        const feedItem = timelinePosts[currentPostIndex];
        if (!feedItem || !feedItem.post) {
          this.logFns.warn("feedItem invalid or missing .post. Skipping...");
          continue;
        }

        // Extraemos datos reales
        const rawPost = feedItem.post;
        const postUri = rawPost.uri;
        const postCid = rawPost.cid;
        const authorHandle = rawPost.author?.handle || "(no handle)";
        // `record.text` a veces es un objeto
        const postText =
          typeof rawPost.record?.text === "string"
            ? rawPost.record.text
            : JSON.stringify(rawPost.record);

        this.logFns.info(
          `Selected post from @${authorHandle}: "${postText.substring(
            0,
            50
          )}..."`
        );

        // Ejecutar acción
        let result: EngagementResult;
        if (!dryRun) {
          if (action.type === "like") {
            await this.atpClient.likePost(postUri, postCid);
            this.logFns.info(`Liked post: ${postUri}`);
          } else {
            await this.atpClient.repostPost(postUri, postCid);
            this.logFns.info(`Reposted post: ${postUri}`);
          }

          result = {
            success: true,
            action: action.type,
            postUri,
            postCid,
          };
        } else {
          this.logFns.info(
            `[DRY RUN] Would have ${action.type}d post: ${postUri}`
          );
          result = {
            success: true,
            action: action.type,
            postUri,
            postCid,
          };
        }

        // Avanzar
        currentPostIndex++;
        action.executed = true;
        results.push(result);

        // Llamar al callback de progreso si existe
        if (progressCallback) {
          await progressCallback(action, i);
        }
      } catch (error) {
        this.logFns.error(`Error executing ${action.type} action:`, error);
        const errorResult: EngagementResult = {
          success: false,
          action: action.type,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        results.push(errorResult);

        if (stopOnError) {
          this.logFns.warn("Stopping execution due to error");
          break;
        }

        // Llamar al callback de progreso incluso en caso de error
        if (progressCallback) {
          await progressCallback(action, i);
        }
      }
    }
    // Resumen de la ejecución
    const successCount = results.filter(
      (r: EngagementResult) => r.success
    ).length;
    this.logFns.info(
      `Engagement execution complete. Success: ${successCount}/${plannedActions.length}`
    );

    return results;
  }
}

export default EngagementService;
