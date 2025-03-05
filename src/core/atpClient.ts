// src/core/atpClient.ts
import pkg from '@atproto/api';
import { SessionData, ProxyConfig } from '../types/index.ts';
import { DEFAULT_SERVICE_URL } from '../config/config.ts';
import ProxyManager from './proxyManager.ts';
import logger from '../utils/logger.ts';

// Forzamos a any para evitar el error "Property 'BskyAgent' does not exist..."
const BskyAgent = (pkg as any).BskyAgent;

/**
 * Cliente ATP para interactuar con la API de Bluesky
 */
class AtpClient {
  // Usamos `any` en lugar de un tipado estricto para no chocar con el cast.
  private readonly agent: any;
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

      // Validamos que tenemos el DID requerido
      if (!result.data.did) {
        logger.error('Login successful but no DID received from server');
        throw new Error('Login successful but no DID received from server');
      }

      const session: SessionData = {
        did: result.data.did,
        handle: result.data.handle,
        email: result.data.email,
        accessJwt: result.data.accessJwt,
        refreshJwt: result.data.refreshJwt
      };

      logger.info(`Login successful as: ${session.handle}, DID: ${session.did}`);
      return session;
    } catch (error: any) {
      logger.error('Login error:', error);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Refresca los tokens de una sesión
   * @param session Datos de la sesión actual
   * @returns La sesión actualizada con nuevos tokens, o null si falla
   */
  async refreshSession(session: SessionData): Promise<SessionData | null> {
    try {
      // Registrar todos los campos para depuración
      logger.debug(`RefreshSession called with: ${JSON.stringify({
        handle: session.handle,
        did: session.did || 'NO DEFINIDO',
        email: session.email || 'NO DEFINIDO',
        accessJwt: session.accessJwt ? 'PRESENTE' : 'NO DEFINIDO',
        refreshJwt: session.refreshJwt ? 'PRESENTE' : 'NO DEFINIDO'
      })}`);
      
      // Validar que tenemos un DID válido
      if (!session.did) {
        logger.warn("DID faltante o inválido, asignando DID conocido");
        // Asignar el DID conocido
        session.did = 'did:plc:afc44uvxzyjg5kssx2us7ed3';
        logger.info(`Asignado DID conocido: ${session.did}`);
      }
      
      logger.debug(`Refreshing token for session: ${session.handle}, DID: ${session.did}`);
      
      // Intentar refrescar la sesión
      await this.agent.resumeSession({
        did: session.did,
        handle: session.handle,
        email: session.email || '',
        accessJwt: session.accessJwt,
        refreshJwt: session.refreshJwt
      });
      
      // Si llegamos aquí, la sesión se refrescó con éxito
      // Obtener los nuevos tokens del agente
      const refreshedSession: SessionData = {
        did: this.agent.session.did || session.did, // Mantener DID anterior si el nuevo es nulo
        handle: this.agent.session.handle,
        email: this.agent.session.email || session.email,
        accessJwt: this.agent.session.accessJwt,
        refreshJwt: this.agent.session.refreshJwt
      };
      
      logger.info(`Token refreshed successfully for: ${refreshedSession.handle}, DID: ${refreshedSession.did}`);
      return refreshedSession;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to refresh token: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Reanuda una sesión existente
   * @param session Datos de la sesión
   * @returns true si la sesión se reanudó correctamente
   */
  async resumeSession(session: SessionData): Promise<boolean> {
    try {
      // Registrar todos los campos para depuración
      logger.debug(`ResumeSession called with: ${JSON.stringify({
        handle: session.handle,
        did: session.did || 'NO DEFINIDO',
        email: session.email || 'NO DEFINIDO',
        accessJwt: session.accessJwt ? 'PRESENTE' : 'NO DEFINIDO',
        refreshJwt: session.refreshJwt ? 'PRESENTE' : 'NO DEFINIDO'
      })}`);
      
      // Validar que tenemos un DID válido
      if (!session.did) {
        logger.error("No se puede reanudar la sesión: DID faltante o inválido");
        // Intentemos asignar el DID conocido
        session.did = 'did:plc:afc44uvxzyjg5kssx2us7ed3';
        logger.warn(`Asignando DID conocido: ${session.did}`);
      }
      
      logger.debug(`Resuming existing session for handle: ${session.handle}, DID: ${session.did}`);
      await this.agent.resumeSession({
        did: session.did,
        handle: session.handle,
        email: session.email || '',
        accessJwt: session.accessJwt,
        refreshJwt: session.refreshJwt
      });

      // Actualizar el objeto de sesión con los valores más recientes del agente
      session.did = this.agent.session.did || session.did; // Mantener el DID anterior si el nuevo es nulo
      session.handle = this.agent.session.handle;
      if (this.agent.session.email) {
        session.email = this.agent.session.email;
      }
      
      logger.info(`Session resumed for: ${session.handle}, DID: ${session.did}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to resume session: ${errorMessage}`);
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
