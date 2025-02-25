// src/services/engagementService.ts
import AtpClient from '../core/atpClient.js';
import { 
  EngagementOptions, 
  ActionType, 
  PlannedAction, 
  SimulationResult, 
  EngagementResult,
  TimelinePost
} from '../types/index.js';
import { getEngagementConfig } from '../config/config.js';
import { getRandomInt } from '../utils/random.js';
import { sleep } from '../utils/delay.js';
import logger from '../utils/logger.js';

/**
 * Servicio para simular y ejecutar acciones de engagement (likes, reposts)
 */
class EngagementService {
  /**
   * Crea una nueva instancia del servicio de engagement
   * @param atpClient Cliente ATP para realizar las acciones
   */
  constructor(private readonly atpClient: AtpClient) {}

  /**
   * Simula un plan de acciones de engagement
   * @param options Opciones de configuración para la simulación
   * @returns Resultado de la simulación
   */
  simulateEngagement(options: Partial<EngagementOptions> = {}): SimulationResult {
    const config = getEngagementConfig();
    
    // Aplicar valores por defecto
    const numberOfActions = options.numberOfActions ?? 10;
    const delayRange = options.delayRange ?? config.defaultDelayRange;
    const skipRange = options.skipRange ?? config.defaultSkipRange;
    const likePercentage = options.likePercentage ?? config.defaultLikePercentage;
    
    logger.info(`Simulating ${numberOfActions} engagement actions (${likePercentage}% likes)...`);
    
    // Calcular número de likes y reposts
    const likeCount = Math.floor(numberOfActions * (likePercentage / 100));
    const repostCount = numberOfActions - likeCount;
    
    // Generar acciones planificadas
    const plannedActions: PlannedAction[] = [];
    let totalTime = 0;
    
    for (let i = 0; i < numberOfActions; i++) {
      // Determinar tipo de acción
      const type: ActionType = i < likeCount ? 'like' : 'repost';
      
      // Generar delay y skip aleatorios
      const delay = getRandomInt(delayRange[0], delayRange[1]);
      const skip = getRandomInt(skipRange[0], skipRange[1]);
      
      plannedActions.push({
        type,
        delay,
        skip,
        index: i
      });
      
      totalTime += delay;
      
      logger.debug(`Planned action ${i+1}: ${type}, Delay = ${delay}s, Skip = ${skip}`);
    }
    
    logger.info(`Simulation complete. Total time: ${totalTime}s`);
    logger.info(`Actions: ${likeCount} likes, ${repostCount} reposts`);
    
    return {
      plannedActions,
      totalTime,
      likeCount,
      repostCount
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
    } = {}
  ): Promise<EngagementResult[]> {
    const { plannedActions } = simulationResult;
    const { dryRun = false, stopOnError = false } = options;
    
    // Obtener posts del timeline si no se proporcionaron
    const timelinePosts = options.timelinePosts || 
      (await this.atpClient.getTimeline(Math.max(50, plannedActions.length * 2))).feed;
    
    if (!timelinePosts || timelinePosts.length === 0) {
      throw new Error('No posts available for engagement actions');
    }
    
    logger.info(`Starting execution of ${plannedActions.length} engagement actions (${dryRun ? 'DRY RUN' : 'REAL EXECUTION'})...`);
    
    const results: EngagementResult[] = [];
    let currentPostIndex = 0;
    
    // Ejecutar cada acción
    for (const action of plannedActions) {
      try {
        logger.info(`Executing action ${action.index + 1}: ${action.type} (delay: ${action.delay}s, skip: ${action.skip})`);
        
        // Aplicar delay
        await sleep(action.delay * 1000);
        
        // Avanzar en el timeline según el número de posts a saltar
        currentPostIndex += action.skip;
        
        // Asegurarse de que el índice está dentro de los límites
        if (currentPostIndex >= timelinePosts.length) {
          currentPostIndex = timelinePosts.length - 1;
          logger.warn(`Skip value too high, using last available post (index: ${currentPostIndex})`);
        }
        
        const post = timelinePosts[currentPostIndex];
        
        logger.info(`Selected post from @${post.author.handle}: "${post.text.substring(0, 50)}..."`);
        
        let result: EngagementResult;
        
        // Ejecutar la acción según el tipo (o simular en modo dryRun)
        if (!dryRun) {
          if (action.type === 'like') {
            await this.atpClient.likePost(post.uri, post.cid);
            logger.info(`Liked post: ${post.uri}`);
          } else {
            await this.atpClient.repostPost(post.uri, post.cid);
            logger.info(`Reposted post: ${post.uri}`);
          }
          
          result = {
            success: true,
            action: action.type,
            postUri: post.uri,
            postCid: post.cid
          };
        } else {
          logger.info(`[DRY RUN] Would have ${action.type}d post: ${post.uri}`);
          
          result = {
            success: true,
            action: action.type,
            postUri: post.uri,
            postCid: post.cid
          };
        }
        
        // Avanzar al siguiente post
        currentPostIndex++;
        
        // Marcar acción como ejecutada y guardar resultado
        action.executed = true;
        results.push(result);
        
      } catch (error) {
        logger.error(`Error executing ${action.type} action:`, error);
        
        const errorResult: EngagementResult = {
          success: false,
          action: action.type,
          error: error instanceof Error ? error : new Error(String(error))
        };
        
        results.push(errorResult);
        
        if (stopOnError) {
          logger.warn('Stopping execution due to error');
          break;
        }
      }
    }
    
    // Resumen de la ejecución
    const successCount = results.filter(r => r.success).length;
    logger.info(`Engagement execution complete. Success: ${successCount}/${plannedActions.length}`);
    
    return results;
  }
}

export default EngagementService;
