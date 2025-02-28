// src/core/atpClient.ts
import pkg from '@atproto/api';
import { SessionData, ProxyConfig } from '../types/index.js';
import { DEFAULT_SERVICE_URL } from '../config/config.js';
import ProxyManager from './proxyManager.js';
import logger from '../utils/logger.js';

// Forzamos a any para evitar el error "Property 'BskyAgent' does not exist..."
const BskyAgent = (pkg as any).BskyAgent;

/**
 * Cliente ATP para interactuar con la API de Bluesky
 */
class AtpClient {
  // Usamos `any` en lugar de un tipado estricto para no chocar con el cast.
  private agent: any;
  private readonly proxyManager?: ProxyManager;

  /**
   * Crea una nueva instancia del cliente ATP
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

    // Crear agente Bluesky
    this.agent = new BskyAgent({
      service: this.serviceUrl
    });

    logger.debug('ATP client initialized with service URL:', this.serviceUrl);
  }

  /**
   * Inicia sesión en Bluesky
   * @param identifier Usuario o email
   * @param password Contraseña
   * @returns Datos de la sesión
   */
  async login(identifier: string, password: string): Promise<SessionData> {
    try {
      logger.info(`Attempting to login as ${identifier}...`);

      const result = await this.agent.login({
        identifier,
        password
      });

      const session: SessionData = {
        did: result.data.did,
        handle: result.data.handle,
        email: result.data.email,
        accessJwt: result.data.accessJwt,
        refreshJwt: result.data.refreshJwt
      };

      logger.info(`Login successful as: ${session.handle}`);
      return session;
    } catch (error: any) {
      logger.error('Login error:', error);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Reanuda una sesión existente
   * @param session Datos de la sesión
   * @returns true si la sesión se reanudó correctamente
   */
  async resumeSession(session: SessionData): Promise<boolean> {
    try {
      logger.debug('Resuming existing session...');
      await this.agent.resumeSession({
        did: session.did,
        handle: session.handle,
        email: session.email,
        accessJwt: session.accessJwt,
        refreshJwt: session.refreshJwt
      });

      logger.info(`Session resumed for: ${session.handle}`);
      return true;
    } catch (error) {
      logger.error('Failed to resume session:', error);
      return false;
    }
  }

  /**
   * Crea un nuevo post
   * @param text Texto del post
   * @returns Respuesta de la API
   */
  async createPost(text: string): Promise<any> {
    if (!this.agent.session?.did) {
      logger.error('Cannot create post: Not logged in');
      throw new Error('Not logged in');
    }

    try {
      logger.debug('Creating post...');
      const result = await this.agent.post({
        text,
        createdAt: new Date().toISOString()
      });
      logger.info('Post created successfully');
      return result;
    } catch (error) {
      logger.error('Error creating post:', error);
      throw error;
    }
  }

  /**
   * Da like a un post
   * @param uri URI del post
   * @param cid CID del post
   * @returns Respuesta de la API
   */
  async likePost(uri: string, cid: string): Promise<any> {
    if (!this.agent.session?.did) {
      logger.error('Cannot like post: Not logged in');
      throw new Error('Not logged in');
    }

    try {
      logger.debug(`Liking post ${uri}...`);
      const result = await this.agent.like(uri, cid);
      logger.info('Post liked successfully');
      return result;
    } catch (error) {
      logger.error('Error liking post:', error);
      throw error;
    }
  }

  /**
   * Hace repost de un post
   * @param uri URI del post
   * @param cid CID del post
   * @returns Respuesta de la API
   */
  async repostPost(uri: string, cid: string): Promise<any> {
    if (!this.agent.session?.did) {
      logger.error('Cannot repost: Not logged in');
      throw new Error('Not logged in');
    }

    try {
      logger.debug(`Reposting ${uri}...`);
      const result = await this.agent.repost(uri, cid);
      logger.info('Repost created successfully');
      return result;
    } catch (error) {
      logger.error('Error creating repost:', error);
      throw error;
    }
  }

  /**
   * Sigue a un usuario
   * @param did DID del usuario a seguir
   * @returns Respuesta de la API
   */
  async followUser(did: string): Promise<any> {
    if (!this.agent.session?.did) {
      logger.error('Cannot follow user: Not logged in');
      throw new Error('Not logged in');
    }

    try {
      logger.debug(`Following user ${did}...`);
      const result = await this.agent.follow(did);
      logger.info('Follow successful');
      return result;
    } catch (error) {
      logger.error('Error following user:', error);
      throw error;
    }
  }

  /**
   * Obtiene el timeline
   * @param limit Número máximo de posts a obtener
   * @returns Timeline del usuario
   */
  async getTimeline(limit: number = 50): Promise<any> {
    if (!this.agent.session?.did) {
      logger.error('Cannot get timeline: Not logged in');
      throw new Error('Not logged in');
    }

    try {
      logger.debug(`Getting timeline (limit: ${limit})...`);
      const result = await this.agent.getTimeline({ limit });
      logger.info(`Retrieved ${result.data.feed.length} posts from timeline`);
      return result.data;
    } catch (error) {
      logger.error('Error getting timeline:', error);
      throw error;
    }
  }

  /**
   * Responde a un post
   * @param replyTo Objeto con uri y cid del post al que se responde
   * @param text Texto de la respuesta
   * @returns Respuesta de la API
   */
  async replyToPost(replyTo: { uri: string; cid: string }, text: string): Promise<any> {
    if (!this.agent.session?.did) {
      logger.error('Cannot reply to post: Not logged in');
      throw new Error('Not logged in');
    }

    try {
      logger.debug(`Replying to post ${replyTo.uri}...`);
      const result = await this.agent.post({
        text,
        createdAt: new Date().toISOString(),
        reply: {
          root: { uri: replyTo.uri, cid: replyTo.cid },
          parent: { uri: replyTo.uri, cid: replyTo.cid }
        }
      });
      logger.info('Reply created successfully');
      return result;
    } catch (error) {
      logger.error('Error replying to post:', error);
      throw error;
    }
  }

  /**
   * Comprueba el estado del proxy
   * @returns Información del proxy
   */
  async checkProxy(): Promise<{ proxyString: string; currentIp: string }> {
    // Si se configuró ProxyManager, lo delegamos
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
   * Obtiene el agente Bluesky para operaciones avanzadas
   */
  getAgent(): any {
    return this.agent;
  }
}

export default AtpClient;
