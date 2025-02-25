// src/index.ts
// Exportar configuraciones
export * from './config/config.js';
export { getEnvVariable } from './config/env.js';

// Exportar tipos
export * from './types/index.js';

// Exportar clases principales
export { default as AtpClient } from './core/atpClient.js';
export { default as SkywareClient } from './core/skywareClient.js';
export { default as ProxyManager } from './core/proxyManager.js';

// Exportar servicios
export { default as SessionService } from './services/sessionService.js';
export { default as PostService } from './services/postService.js';
export { default as ChatService } from './services/chatService.js';
export { default as EngagementService } from './services/engagementService.js';

// Exportar estrategias
export { 
  RandomEngagementStrategy, 
  HumanLikeEngagementStrategy,
  createEngagementStrategy
} from './strategies/engagementStrategy.js';

// Exportar utilidades
export { default as logger } from './utils/logger.js';
export * from './utils/delay.js';
export * from './utils/random.js';

// Crear una función para inicializar todo el sistema
import { getProxyConfig, getBskyCredentials } from './config/config.js';
import AtpClient from './core/atpClient.js';
import SkywareClient from './core/skywareClient.js';
import SessionService from './services/sessionService.js';
import PostService from './services/postService.js';
import ChatService from './services/chatService.js';
import EngagementService from './services/engagementService.js';
import logger from './utils/logger.js';
import { LogLevel } from './types/index.js';

/**
 * Opciones para inicializar el cliente Bluesky
 */
export interface BskyInitOptions {
  /**
   * Nivel de log a utilizar
   */
  logLevel?: LogLevel;
  
  /**
   * Ruta al archivo de sesión
   */
  sessionFilePath?: string;
  
  /**
   * Si es true, usa las credenciales de .env para iniciar sesión
   */
  autoLogin?: boolean;
  
  /**
   * Si es true, inicializa el componente de chat
   */
  enableChat?: boolean;
  
  /**
   * Preferencia de chat a establecer
   */
  chatPreference?: 'All' | 'Following' | 'None';
}

/**
 * Inicializa todo el sistema Bluesky
 * @param options Opciones de inicialización
 * @returns Objeto con todos los componentes inicializados
 */
export async function initializeBsky(options: BskyInitOptions = {}) {
  const {
    logLevel = LogLevel.INFO,
    sessionFilePath,
    autoLogin = true,
    enableChat = false,
    chatPreference = 'Following'
  } = options;
  
  // Configurar logger
  logger.setLevel(logLevel);
  
  logger.info('Initializing Bluesky client system...');
  
  // Obtener configuración del proxy
  const proxyConfig = getProxyConfig();
  
  // Crear servicios principales
  const atpClient = new AtpClient(undefined, proxyConfig);
  const sessionService = new SessionService(sessionFilePath);
  
  // Iniciar sesión si es necesario
  let session = null;
  if (autoLogin) {
    // Primero intentar reanudar sesión existente
    const existingSession = await sessionService.loadSession();
    if (existingSession) {
      logger.info('Attempting to resume existing session...');
      const resumed = await atpClient.resumeSession(existingSession);
      
      if (resumed) {
        session = existingSession;
        logger.info(`Session resumed for: ${session.handle}`);
      } else {
        logger.warn('Failed to resume session, will try fresh login');
      }
    }
    
    // Si no hay sesión o no se pudo reanudar, iniciar sesión nueva
    if (!session) {
      const { username, password } = getBskyCredentials();
      logger.info(`No valid session found, logging in as ${username}...`);
      
      session = await atpClient.login(username, password);
      await sessionService.saveSession(session);
    }
  }
  
  // Crear cliente Skyware si se solicita chat
  let skywareClient = null;
  let chatService = null;
  
  if (enableChat) {
    logger.info('Initializing Skyware client for chat functionality...');
    skywareClient = new SkywareClient(undefined, proxyConfig);
    await skywareClient.initialize();
    
    // Iniciar sesión en Skyware
    if (session) {
      const { username, password } = getBskyCredentials();
      await skywareClient.login(username, password);
      
      // Configurar servicio de chat
      chatService = new ChatService(skywareClient);
      await chatService.setChatPreference(chatPreference);
    }
  }
  
  // Crear servicios adicionales
  const postService = new PostService(atpClient, skywareClient || {} as SkywareClient);
  const engagementService = new EngagementService(atpClient);
  
  logger.info('Bluesky client system initialization complete');
  
  // Devolver todos los componentes inicializados
  return {
    atpClient,
    skywareClient,
    sessionService,
    postService,
    chatService,
    engagementService,
    session
  };
}

export default {
  initializeBsky
};
