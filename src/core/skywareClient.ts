// src/core/skywareClient.ts
import { SkywareBot, ProxyConfig } from '../types/index.ts';
import ProxyManager from './proxyManager.ts';
import { DEFAULT_SERVICE_URL } from '../config/config.ts';
import logger from '../utils/logger.ts';

/**
 * Cliente para interactuar con Skyware Bot
 */
class SkywareClient {
  private bot: SkywareBot | null = null;
  private readonly proxyManager?: ProxyManager;
  
  /**
   * Crea una nueva instancia del cliente Skyware
   * @param serviceUrl URL del servicio de Bluesky
   * @param proxyConfig Configuración opcional del proxy
   */
  constructor(
    private readonly serviceUrl: string = DEFAULT_SERVICE_URL,
    proxyConfig?: ProxyConfig
  ) {
    // Configurar proxy si se proporciona
    if (proxyConfig) {
      this.proxyManager = new ProxyManager(proxyConfig);
      this.proxyManager.setupGlobalProxy();
    }
    
    logger.debug('Skyware client constructor called');
  }
  
  /**
   * Inicializa el cliente Skyware
   */
  async initialize(): Promise<SkywareClient> {
    try {
      logger.debug('Initializing Skyware Bot...');
      const Skyware = await import('@skyware/bot');
      
      // Crear instancia del bot
      this.bot = new Skyware.Bot({
        service: this.serviceUrl,
        emitChatEvents: true
      });
      
      logger.info('Skyware Bot initialized successfully');
      return this;
    } catch (error) {
      logger.error('Error initializing Skyware Bot:', error);
      throw error;
    }
  }
  
  /**
   * Inicia sesión en Bluesky usando Skyware
   * @param identifier Usuario o email
   * @param password Contraseña
   * @returns Perfil del usuario
   */
  async login(identifier: string, password: string): Promise<any> {
    this.ensureInitialized();
    
    try {
      logger.info(`Attempting to login as ${identifier} using Skyware...`);
      
      await this.bot!.login({
        identifier,
        password
      });
      
      logger.info(`Skyware login successful as: ${this.bot!.profile.handle}`);
      return this.bot!.profile;
    } catch (error: any) {
      logger.error('Skyware login error:', error);
      throw new Error(`Skyware login failed: ${error.message}`);
    }
  }
  
  /**
   * Establece las preferencias de chat
   * @param preference Preferencia de chat (ej: IncomingChatPreference.All)
   */
  async setChatPreference(preference: any): Promise<void> {
    this.ensureInitialized();
    
    try {
      logger.debug(`Setting chat preference to: ${preference}...`);
      await this.bot!.setChatPreference(preference);
      logger.info(`Chat preference set to: ${preference}`);
    } catch (error) {
      logger.error('Error setting chat preference:', error);
      throw error;
    }
  }
  
  /**
   * Registra un callback para los mensajes de chat
   * @param callback Función a llamar cuando se recibe un mensaje
   */
  onMessage(callback: (message: any) => Promise<void>): void {
    this.ensureInitialized();
    
    logger.debug('Setting up message event listener...');
    this.bot!.on('message', callback);
    logger.info('Message event listener configured');
  }
  
  /**
   * Registra un callback para las respuestas a posts
   * @param callback Función a llamar cuando se recibe una respuesta
   */
  onReply(callback: (reply: any) => Promise<void>): void {
    this.ensureInitialized();
    
    logger.debug('Setting up reply event listener...');
    this.bot!.on('reply', callback);
    logger.info('Reply event listener configured');
  }
  
  /**
   * Registra un callback para las menciones
   * @param callback Función a llamar cuando el bot es mencionado
   */
  onMention(callback: (mention: any) => Promise<void>): void {
    this.ensureInitialized();
    
    logger.debug('Setting up mention event listener...');
    this.bot!.on('mention', callback);
    logger.info('Mention event listener configured');
  }
  
  /**
   * Registra un callback para los nuevos seguidores
   * @param callback Función a llamar cuando alguien sigue al bot
   */
  onFollow(callback: (follow: any) => Promise<void>): void {
    this.ensureInitialized();
    
    logger.debug('Setting up follow event listener...');
    this.bot!.on('follow', callback);
    logger.info('Follow event listener configured');
  }
  
  /**
   * Obtiene o crea una conversación con uno o más usuarios
   * @param didOrHandles Array de DIDs o handles de usuarios
   * @returns Objeto de conversación
   */
  async getConversationForMembers(didOrHandles: string[]): Promise<any> {
    this.ensureInitialized();
    
    try {
      logger.debug(`Getting conversation for members: ${didOrHandles.join(', ')}...`);
      const conversation = await this.bot!.getConversationForMembers(didOrHandles);
      logger.info('Conversation retrieved successfully');
      return conversation;
    } catch (error) {
      logger.error('Error getting conversation:', error);
      throw error;
    }
  }
  
  /**
   * Lista las conversaciones del bot
   * @param options Opciones para paginar resultados
   * @returns Lista de conversaciones
   */
  async listConversations(options?: { cursor?: string }): Promise<any> {
    this.ensureInitialized();
    
    try {
      logger.debug('Listing conversations...');
      const conversations = await this.bot!.listConversations(options);
      logger.info(`Retrieved ${conversations.conversations.length} conversations`);
      return conversations;
    } catch (error) {
      logger.error('Error listing conversations:', error);
      throw error;
    }
  }
  
  /**
   * Crea un post usando Skyware
   * @param text Texto del post
   * @returns Respuesta de la API
   */
  async post(text: string): Promise<any> {
    this.ensureInitialized();
    
    try {
      logger.debug('Creating post using Skyware...');
      const post = await this.bot!.post({ text });
      logger.info('Post created successfully');
      return post;
    } catch (error) {
      logger.error('Error creating post:', error);
      throw error;
    }
  }
  
  /**
   * Detiene todos los listeners de eventos
   */
  shutdown(): void {
    if (this.bot) {
      logger.debug('Shutting down Skyware Bot...');
      this.bot.removeAllListeners();
      logger.info('Skyware Bot shutdown complete');
    }
  }
  
  /**
   * Obtiene el bot Skyware para operaciones avanzadas
   * @returns La instancia del bot Skyware
   */
  getBot(): SkywareBot | null {
    return this.bot;
  }
  
  /**
   * Comprueba el estado del proxy
   * @returns Información del proxy
   */
  async checkProxy(): Promise<{ proxyString: string; currentIp: string }> {
    if (this.proxyManager) {
      return await this.proxyManager.checkProxy();
    }
    
    try {
      logger.debug('Checking IP (no proxy configured)...');
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      
      return {
        proxyString: 'No proxy configured',
        currentIp: data.ip
      };
    } catch (error) {
      logger.error('Error checking IP:', error);
      return {
        proxyString: 'No proxy configured',
        currentIp: 'Error getting IP'
      };
    }
  }
  
  /**
   * Método auxiliar para asegurar que el bot está inicializado
   * @throws Error si el bot no está inicializado
   */
  private ensureInitialized(): void {
    if (!this.bot) {
      throw new Error('Skyware Bot not initialized. Call initialize() first.');
    }
  }
}

export default SkywareClient;
