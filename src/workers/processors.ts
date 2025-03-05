// src/workers/processors.ts
import { Job } from 'bullmq';
import { initializeBsky, LogLevel } from '../index.ts';
import logger from '../utils/logger.ts';
import { createEngagementStrategy } from '../strategies/engagementStrategy.ts';
import { SessionData, PlannedAction, EngagementResult } from '../types/index.ts';
import { LoggerFunctions } from '../services/engagementService.ts';
import { updateAccountTokens } from '../config/supabase.ts';

// Forzamos a any para evitar el error "Property 'BskyAgent' does not exist..."

/**
 * Procesa un trabajo basicBot
 */
export async function basicBotProcessor(job: Job): Promise<any> {
  logger.info(`Processing basicBot job ${job.id}`);
  await job.updateProgress(10);

  try {
    const {
      sessionData,
      message,
      accountMetadata // Nueva metadata de la cuenta para manejar refrescar tokens
    } = job.data;
    
    if (!sessionData) {
      throw new Error('No session data provided in job');
    }

    const { atpClient, postService } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false,
    });

    await job.updateProgress(20);

    // ===== GESTIÓN DE AUTENTICACIÓN MEJORADA =====
    // Implementamos tres métodos de autenticación en orden
    let sessionResumed = false;
    let resumeError: unknown = null;

    // 1. MÉTODO 1: Primero intentar refrescar el token usando atpClient
    try {
      logger.info(`[Método 1] Intentando refrescar token para ${sessionData.handle} usando atpClient`);
      
      if (sessionData.refreshJwt) {
        // Intentar refrescar el token primero
        const refreshedSession = await atpClient.refreshSession(sessionData as SessionData);
        
        if (refreshedSession) {
          // Si llegamos aquí, el token se refrescó con éxito
          sessionResumed = true;
          
          // Actualizar sessionData con los nuevos tokens
          sessionData.accessJwt = refreshedSession.accessJwt;
          sessionData.refreshJwt = refreshedSession.refreshJwt;
          sessionData.did = refreshedSession.did;
          
          // Actualizar tokens en la base de datos si tenemos ID de cuenta
          if (accountMetadata && accountMetadata.accountId) {
            await updateAccountTokens(
              accountMetadata.accountId,
              refreshedSession.accessJwt,
              refreshedSession.refreshJwt
            );
            logger.info(`Tokens actualizados en BD para la cuenta ${accountMetadata.accountId}`);
          }
          
          logger.info(`Token refrescado con éxito para: ${sessionData.handle}`);
        }
      } else {
        logger.warn(`No hay refreshJwt disponible para ${sessionData.handle}, saltando al método 2`);
      }
    } catch (error: unknown) {
      resumeError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Falló al refrescar token con atpClient: ${errorMessage}`);
    }

    // 2. MÉTODO 2: Intentar resumir la sesión normalmente si el primer método falló
    if (!sessionResumed) {
      try {
        logger.info(`[Método 2] Intentando reanudar sesión para ${sessionData.handle} usando atpClient`);
        sessionResumed = await atpClient.resumeSession(sessionData as SessionData);
        
        if (sessionResumed) {
          logger.info(`Sesión reanudada correctamente usando atpClient.resumeSession`);
        }
      } catch (error: unknown) {
        resumeError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Falló al reanudar sesión con atpClient: ${errorMessage}`);
      }
    }

    // 3. MÉTODO 3: Realizar login completo si todo lo anterior falló
    if (!sessionResumed && accountMetadata && accountMetadata.password) {
      try {
        logger.info(`[Método 3] Intentando login completo para ${sessionData.handle}`);
        
        // Login con atpClient
        const loginResult = await atpClient.login(sessionData.handle, accountMetadata.password);
        
        // Actualizar sessionData
        sessionData.accessJwt = loginResult.accessJwt;
        sessionData.refreshJwt = loginResult.refreshJwt;
        sessionData.did = loginResult.did;
        
        // Actualizar tokens en la base de datos
        if (accountMetadata.accountId) {
          await updateAccountTokens(
            accountMetadata.accountId,
            loginResult.accessJwt,
            loginResult.refreshJwt
          );
          logger.info(`Tokens actualizados después del login para cuenta ${accountMetadata.accountId}`);
        }
        
        sessionResumed = true;
        logger.info(`Sesión iniciada correctamente mediante login completo`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Login falló: ${errorMessage}`);
        throw new Error(`Todos los métodos de autenticación fallaron. Último error: ${errorMessage}`);
      }
    }

    // Si ningún método funcionó, lanzar error
    if (!sessionResumed) {
      const errorMsg = resumeError instanceof Error
        ? resumeError.message
        : (resumeError ? String(resumeError) : 'Error desconocido');
        
      throw new Error(`No se pudo reanudar la sesión: ${errorMsg}`);
    }

    await job.updateProgress(30);

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
export async function chatBotProcessor(job: Job): Promise<any> {
  logger.info(`Processing chatBot job ${job.id}`);
  await job.updateProgress(10);

  try {
    const {
      sessionData,
      messages,
      recipients,
      accountMetadata // Nueva metadata de la cuenta para manejar refrescar tokens
    } = job.data;
    
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

    await job.updateProgress(20);

    // ===== GESTIÓN DE AUTENTICACIÓN MEJORADA =====
    // Implementamos tres métodos de autenticación en orden
    let sessionResumed = false;
    let resumeError: unknown = null;

    // 1. MÉTODO 1: Primero intentar refrescar el token usando atpClient
    try {
      logger.info(`[Método 1] Intentando refrescar token para ${sessionData.handle} usando atpClient`);
      
      if (sessionData.refreshJwt) {
        // Intentar refrescar el token primero
        const refreshedSession = await atpClient.refreshSession(sessionData as SessionData);
        
        if (refreshedSession) {
          // Si llegamos aquí, el token se refrescó con éxito
          sessionResumed = true;
          
          // Actualizar sessionData con los nuevos tokens
          sessionData.accessJwt = refreshedSession.accessJwt;
          sessionData.refreshJwt = refreshedSession.refreshJwt;
          sessionData.did = refreshedSession.did;
          
          // Actualizar tokens en la base de datos si tenemos ID de cuenta
          if (accountMetadata && accountMetadata.accountId) {
            await updateAccountTokens(
              accountMetadata.accountId,
              refreshedSession.accessJwt,
              refreshedSession.refreshJwt
            );
            logger.info(`Tokens actualizados en BD para la cuenta ${accountMetadata.accountId}`);
          }
          
          logger.info(`Token refrescado con éxito para: ${sessionData.handle}`);
        }
      } else {
        logger.warn(`No hay refreshJwt disponible para ${sessionData.handle}, saltando al método 2`);
      }
    } catch (error: unknown) {
      resumeError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Falló al refrescar token con atpClient: ${errorMessage}`);
    }

    // 2. MÉTODO 2: Intentar resumir la sesión normalmente si el primer método falló
    if (!sessionResumed) {
      try {
        logger.info(`[Método 2] Intentando reanudar sesión para ${sessionData.handle} usando atpClient`);
        sessionResumed = await atpClient.resumeSession(sessionData as SessionData);
        
        if (sessionResumed) {
          logger.info(`Sesión reanudada correctamente usando atpClient.resumeSession`);
        }
      } catch (error: unknown) {
        resumeError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Falló al reanudar sesión con atpClient: ${errorMessage}`);
      }
    }

    // 3. MÉTODO 3: Realizar login completo si todo lo anterior falló
    if (!sessionResumed && accountMetadata && accountMetadata.password) {
      try {
        logger.info(`[Método 3] Intentando login completo para ${sessionData.handle}`);
        
        // Login con atpClient
        const loginResult = await atpClient.login(sessionData.handle, accountMetadata.password);
        
        // Actualizar sessionData
        sessionData.accessJwt = loginResult.accessJwt;
        sessionData.refreshJwt = loginResult.refreshJwt;
        sessionData.did = loginResult.did;
        
        // Actualizar tokens en la base de datos
        if (accountMetadata.accountId) {
          await updateAccountTokens(
            accountMetadata.accountId,
            loginResult.accessJwt,
            loginResult.refreshJwt
          );
          logger.info(`Tokens actualizados después del login para cuenta ${accountMetadata.accountId}`);
        }
        
        sessionResumed = true;
        logger.info(`Sesión iniciada correctamente mediante login completo`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Login falló: ${errorMessage}`);
        throw new Error(`Todos los métodos de autenticación fallaron. Último error: ${errorMessage}`);
      }
    }

    // Si ningún método funcionó, lanzar error
    if (!sessionResumed) {
      const errorMsg = resumeError instanceof Error
        ? resumeError.message
        : (resumeError ? String(resumeError) : 'Error desconocido');
        
      throw new Error(`No se pudo reanudar la sesión: ${errorMsg}`);
    }

    await job.updateProgress(30);

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
export async function engagementBotProcessor(job: Job): Promise<any> {
  logger.info(`Processing engagementBot job ${job.id}`);
  await job.updateProgress(10);

  try {
    const { 
      sessionData, 
      engagementOptions = {}, 
      strategyType = 'human-like',
      accountMetadata // Nueva metadata de la cuenta
    } = job.data;
    
    if (!sessionData) {
      throw new Error('No session data provided in job');
    }

    logger.info(`Processing engagement for account: ${sessionData.handle}`);
    
    const { atpClient, engagementService } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false,
    });

    await job.updateProgress(20);

    // ===== GESTIÓN DE AUTENTICACIÓN MEJORADA =====
    // Implementamos tres métodos de autenticación en orden
    let sessionResumed = false;
    let resumeError: unknown = null;

    // 1. MÉTODO 1: Primero intentar refrescar el token usando atpClient
    try {
      logger.info(`[Método 1] Intentando refrescar token para ${sessionData.handle} usando atpClient`);
      
      if (sessionData.refreshJwt) {
        // Intentar refrescar el token primero
        const refreshedSession = await atpClient.refreshSession(sessionData as SessionData);
        
        if (refreshedSession) {
          // Si llegamos aquí, el token se refrescó con éxito
          sessionResumed = true;
          
          // Actualizar sessionData con los nuevos tokens
          sessionData.accessJwt = refreshedSession.accessJwt;
          sessionData.refreshJwt = refreshedSession.refreshJwt;
          sessionData.did = refreshedSession.did;
          
          // Actualizar tokens en la base de datos si tenemos ID de cuenta
          if (accountMetadata && accountMetadata.accountId) {
            await updateAccountTokens(
              accountMetadata.accountId,
              refreshedSession.accessJwt,
              refreshedSession.refreshJwt
            );
            logger.info(`Tokens actualizados en BD para la cuenta ${accountMetadata.accountId}`);
          }
          
          logger.info(`Token refrescado con éxito para: ${sessionData.handle}`);
        }
      } else {
        logger.warn(`No hay refreshJwt disponible para ${sessionData.handle}, saltando al método 2`);
      }
    } catch (error: unknown) {
      resumeError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Falló al refrescar token con atpClient: ${errorMessage}`);
    }

    // 2. MÉTODO 2: Intentar resumir la sesión normalmente si el primer método falló
    if (!sessionResumed) {
      try {
        logger.info(`[Método 2] Intentando reanudar sesión para ${sessionData.handle} usando atpClient`);
        sessionResumed = await atpClient.resumeSession(sessionData as SessionData);
        
        if (sessionResumed) {
          logger.info(`Sesión reanudada correctamente usando atpClient.resumeSession`);
        }
      } catch (error: unknown) {
        resumeError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Falló al reanudar sesión con atpClient: ${errorMessage}`);
      }
    }

    // 3. MÉTODO 3: Realizar login completo si todo lo anterior falló
    if (!sessionResumed && accountMetadata && accountMetadata.password) {
      try {
        logger.info(`[Método 3] Intentando login completo para ${sessionData.handle}`);
        
        // Login con atpClient
        const loginResult = await atpClient.login(sessionData.handle, accountMetadata.password);
        
        // Actualizar sessionData
        sessionData.accessJwt = loginResult.accessJwt;
        sessionData.refreshJwt = loginResult.refreshJwt;
        sessionData.did = loginResult.did;
        
        // Actualizar tokens en la base de datos
        if (accountMetadata.accountId) {
          await updateAccountTokens(
            accountMetadata.accountId,
            loginResult.accessJwt,
            loginResult.refreshJwt
          );
          logger.info(`Tokens actualizados después del login para cuenta ${accountMetadata.accountId}`);
        }
        
        sessionResumed = true;
        logger.info(`Sesión iniciada correctamente mediante login completo`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Login falló: ${errorMessage}`);
        throw new Error(`Todos los métodos de autenticación fallaron. Último error: ${errorMessage}`);
      }
    }

    // Si ningún método funcionó, lanzar error
    if (!sessionResumed) {
      const errorMsg = resumeError instanceof Error 
        ? resumeError.message 
        : (resumeError ? String(resumeError) : 'Error desconocido');
        
      throw new Error(`No se pudo reanudar la sesión: ${errorMsg}`);
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
    
    // Crear un logger personalizado que envíe los logs al job
    // Helper para formatear mensajes de log
    function formatLogMessage(message: string, args: any[]): string {
      if (args.length === 0) return message;
      
      try {
        const formattedArgs = args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        return `${message} ${formattedArgs}`;
      } catch (e) {
        return `${message} [Error formatting args]`;
      }
    }
    
    const jobLogger: LoggerFunctions = {
      info: (message: string, ...args: any[]) => {
        const formattedMsg = formatLogMessage(message, args);
        console.log(formattedMsg); // Esto será capturado y añadido al job
      },
      debug: (message: string, ...args: any[]) => {
        const formattedMsg = formatLogMessage(message, args);
        console.debug(formattedMsg); // Esto será capturado y añadido al job
      },
      warn: (message: string, ...args: any[]) => {
        const formattedMsg = formatLogMessage(message, args);
        console.warn(formattedMsg); // Esto será capturado y añadido al job
      },
      error: (message: string, ...args: any[]) => {
        const formattedMsg = formatLogMessage(message, args);
        console.error(formattedMsg); // Esto será capturado y añadido al job
      }
    };
    
    // Crear una nueva instancia de EngagementService con el logger personalizado
    const customEngagementService = new (engagementService.constructor as any)(
      atpClient,
      jobLogger
    );
    
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
    const results = await customEngagementService.executeEngagement(
      simulationResult,
      {
        timelinePosts: timelineResponse.feed,
        stopOnError: false,
        dryRun: false,
        progressCallback: async (action: PlannedAction, index: number) => {
          // Aquí usamos console.log para que se capture con captureOutput: true
          console.log(`Executing ${action.type} action #${index+1}`);
          await reportActionProgress();
        }
      }
    );
    await job.updateProgress(100);

    const successCount = results.filter((r: EngagementResult) => r.success).length;
    const likeCount = results.filter((r: EngagementResult) => r.success && r.action === 'like').length;
    const repostCount = results.filter((r: EngagementResult) => r.success && r.action === 'repost').length;
    const errorCount = results.filter((r: EngagementResult) => !r.success).length;

    return {
      success: true,
      message: 'Engagement bot job completed',
      account: accountMetadata ? {
        id: accountMetadata.accountId,
        username: sessionData.handle
      } : undefined,
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
