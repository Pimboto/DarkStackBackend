// src/workers/processors/BaseProcessor.ts
import { Job } from 'bullmq';
import { initializeBsky, LogLevel } from '../../index.ts';
import logger from '../../utils/logger.ts';
import { SessionData } from '../../types/index.ts';
import { updateAccountTokens } from '../../config/supabase.ts';
import { LoggerFunctions } from '../../services/engagementService.ts';

/**
 * Base class for all job processors
 * Encapsulates common functionality like authentication and progress reporting
 */
export abstract class BaseProcessor {
  /**
   * Process the job
   * @param job BullMQ job
   * @returns Processing result
   */
  abstract process(job: Job): Promise<any>;

  /**
   * Format log messages
   * @param message Log message
   * @param args Additional arguments
   * @returns Formatted message
   */
  protected formatLogMessage(message: string, args: any[]): string {
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

  /**
   * Creates a job-specific logger that logs to both the job and the main logger
   * @param job BullMQ job
   * @returns Custom logger functions
   */
  protected createJobLogger(job: Job): LoggerFunctions {
    return {
      info: (message: string, ...args: any[]) => {
        const formattedMsg = this.formatLogMessage(message, args);
        job.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: formattedMsg
        })).catch(err => logger.error(`Error logging to job: ${err}`));
        logger.info(formattedMsg);
      },
      debug: (message: string, ...args: any[]) => {
        const formattedMsg = this.formatLogMessage(message, args);
        job.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'debug',
          message: formattedMsg
        })).catch(err => logger.error(`Error logging to job: ${err}`));
        logger.debug(formattedMsg);
      },
      warn: (message: string, ...args: any[]) => {
        const formattedMsg = this.formatLogMessage(message, args);
        job.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: formattedMsg
        })).catch(err => logger.error(`Error logging to job: ${err}`));
        logger.warn(formattedMsg);
      },
      error: (message: string, ...args: any[]) => {
        const formattedMsg = this.formatLogMessage(message, args);
        job.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: formattedMsg
        })).catch(err => logger.error(`Error logging to job: ${err}`));
        logger.error(formattedMsg);
      }
    };
  }

  /**
   * Handles authentication using a 3-step approach:
   * 1. Try to refresh token
   * 2. Try to resume session
   * 3. Try full login
   * 
   * @param sessionData Session data from the job
   * @param accountMetadata Account metadata containing credentials
   * @returns Authentication result with atpClient and updated session
   */
  protected async handleAuthentication(sessionData: SessionData, accountMetadata?: any) {
    const { atpClient } = await initializeBsky({
      logLevel: LogLevel.DEBUG,
      autoLogin: false,
    });

    // ===== GESTIÓN DE AUTENTICACIÓN MEJORADA =====
    // Implementamos tres métodos de autenticación en orden
    let sessionResumed = false;
    let resumeError: unknown = null;

    // 1. MÉTODO 1: Primero intentar refrescar el token usando atpClient
    try {
      // Debug: Mostrar objeto completo sessionData para diagnosticar
      logger.debug(`SessionData recibido: ${JSON.stringify({
        handle: sessionData.handle,
        did: sessionData.did || 'NO DEFINIDO',
        email: sessionData.email ?? 'NO DEFINIDO',
        accessJwt: sessionData.accessJwt ? 'PRESENTE' : 'NO DEFINIDO',
        refreshJwt: sessionData.refreshJwt ? 'PRESENTE' : 'NO DEFINIDO'
      })}`);
      
      logger.info(`[Método 1] Intentando refrescar token para ${sessionData.handle} usando atpClient`);
      
      // Asignar el DID conocido si no está presente
      if (!sessionData.did) {
        logger.warn('DID no presente en sessionData, asignando DID conocido');
        sessionData.did = 'did:plc:afc44uvxzyjg5kssx2us7ed3';
      }
      
      if (sessionData.refreshJwt) {
        // Intentar refrescar el token primero
        const refreshedSession = await atpClient.refreshSession(sessionData);
        
        if (refreshedSession) {
          // Si llegamos aquí, el token se refrescó con éxito
          sessionResumed = true;
          
          // Actualizar sessionData con los nuevos tokens
          sessionData.accessJwt = refreshedSession.accessJwt;
          sessionData.refreshJwt = refreshedSession.refreshJwt;
          sessionData.did = refreshedSession.did;
          
          // Actualizar tokens y DID en la base de datos si tenemos ID de cuenta
          if (accountMetadata && accountMetadata.accountId) {
            await updateAccountTokens(
              accountMetadata.accountId,
              refreshedSession.accessJwt,
              refreshedSession.refreshJwt,
              refreshedSession.did // Pasamos el DID para actualizarlo en la base de datos
            );
            logger.info(`Tokens y DID actualizados en BD para la cuenta ${accountMetadata.accountId}`);
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
        sessionResumed = await atpClient.resumeSession(sessionData);
        
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
        
        // Actualizar tokens, DID y email en la base de datos
        if (accountMetadata.accountId) {
          await updateAccountTokens(
            accountMetadata.accountId,
            loginResult.accessJwt,
            loginResult.refreshJwt,
            loginResult.did,
            loginResult.email // Pasamos el email si está disponible
          );
          logger.info(`Tokens, DID y email actualizados después del login para cuenta ${accountMetadata.accountId}`);
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

    return { atpClient, sessionData };
  }

  /**
   * Checks the proxy status
   * @param atpClient ATP Client instance
   * @returns Proxy information
   */
  protected async checkProxy(atpClient: any) {
    const proxyInfo = await atpClient.checkProxy();
    logger.info(`Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`);
    return proxyInfo;
  }
}
