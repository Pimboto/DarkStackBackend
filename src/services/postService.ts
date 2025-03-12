// src/services/postService.ts
import AtpClient from '../core/atpClient.ts';
import SkywareClient from '../core/skywareClient.ts';
import logger from '../utils/logger.ts';

/**
 * Tipo de cliente a utilizar para crear posts
 */
type ClientType = 'atp' | 'skyware';

/**
 * Opciones para la creación de posts
 */
interface PostOptions {
  /**
   * Cliente a utilizar (ATP o Skyware)
   * @default 'atp'
   */
  clientType?: ClientType;
  
  /**
   * URL de la imagen a adjuntar (no implementado aún)
   */
  imageUrl?: string;
  
  /**
   * Si es true, incluye la fecha y hora actual en el post
   * @default false
   */
  includeTimestamp?: boolean;
}

/**
 * Servicio para la gestión de posts
 */
class PostService {
  /**
   * Crea una instancia del servicio de posts
   * @param atpClient Cliente ATP
   * @param skywareClient Cliente Skyware
   */
  constructor(
    private readonly atpClient: AtpClient,
    private readonly skywareClient: SkywareClient
  ) {}

  /**
   * Crea un nuevo post
   * @param text Texto del post
   * @param options Opciones adicionales
   * @returns Resultado de la creación del post
   */
  async createPost(text: string, options: PostOptions = {}): Promise<any> {
    const {
      clientType = 'atp',
      includeTimestamp = false
    } = options;
    
    // Añadir timestamp si se solicita
    let postText = text;
    if (includeTimestamp) {
      const timestamp = new Date().toISOString();
      postText = `${postText}\n\n[${timestamp}]`;
    }
    
    logger.info(`Creating post using ${clientType} client...`);
    
    try {
      // Usar el cliente correspondiente
      if (clientType === 'atp') {
        const result = await this.atpClient.createPost(postText);
        logger.info('Post created successfully with ATP client');
        return result;
      } else {
        const result = await this.skywareClient.post(postText);
        logger.info('Post created successfully with Skyware client');
        return result;
      }
    } catch (error) {
      logger.error('Error creating post:', error);
      throw error;
    }
  }

  /**
   * Crea una respuesta a un post existente
   * @param replyTo Información del post al que se responde
   * @param text Texto de la respuesta
   * @returns Resultado de la creación de la respuesta
   */
  async replyToPost(replyTo: { uri: string; cid: string }, text: string): Promise<any> {
    try {
      logger.info(`Replying to post ${replyTo.uri}...`);
      const result = await this.atpClient.replyToPost(replyTo, text);
      logger.info('Reply created successfully');
      return result;
    } catch (error) {
      logger.error('Error creating reply:', error);
      throw error;
    }
  }

  /**
   * Obtiene el timeline del usuario
   * @param limit Número máximo de posts a obtener
   * @returns Timeline con los posts
   */
  async getTimeline(limit: number = 100): Promise<any> {
    try {
      logger.info(`Getting timeline (limit: ${limit})...`);
      const timeline = await this.atpClient.getTimeline(limit);
      logger.info(`Retrieved ${timeline.feed.length} posts from timeline`);
      return timeline;
    } catch (error) {
      logger.error('Error getting timeline:', error);
      throw error;
    }
  }

  /**
   * Da like a un post
   * @param uri URI del post
   * @param cid CID del post
   * @returns Resultado de la operación
   */
  async likePost(uri: string, cid: string): Promise<any> {
    try {
      logger.info(`Liking post ${uri}...`);
      const result = await this.atpClient.likePost(uri, cid);
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
   * @returns Resultado de la operación
   */
  async repostPost(uri: string, cid: string): Promise<any> {
    try {
      logger.info(`Reposting ${uri}...`);
      const result = await this.atpClient.repostPost(uri, cid);
      logger.info('Repost created successfully');
      return result;
    } catch (error) {
      logger.error('Error creating repost:', error);
      throw error;
    }
  }
}

export default PostService;
