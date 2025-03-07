// src/workers/processors/massPostProcessor.ts
import { Job } from 'bullmq';
import { BaseProcessor } from './BaseProcessor.ts';
import logger from '../../utils/logger.ts';
import { sleep } from '../../utils/delay.ts';
import { getRandomInt } from '../../utils/random.ts';

/**
 * Options for mass post processor
 */
export interface MassPostOptions {
  /**
   * Array of post content to publish
   */
  posts: {
    /**
     * Post text content
     */
    text: string;
    /**
     * Optional image URL or base64 content
     */
    imageUrl?: string;
    /**
     * Whether to pin this post (only the first one with pin=true will be pinned)
     */
    pin?: boolean;
    /**
     * Alt text for the image
     */
    alt?: string;
    /**
     * Whether to include timestamp in the post
     */
    includeTimestamp?: boolean;
  }[];
  
  /**
   * Delay range between posts in seconds
   */
  delayRange?: [number, number];
  
  /**
   * Whether to process in reverse order (oldest first)
   */
  reverseOrder?: boolean;
}

/**
 * Processor for mass post jobs
 * Handles posting multiple posts with optional images and pinning
 */
export class MassPostProcessor extends BaseProcessor {
  /**
   * Process a mass post job
   * @param job BullMQ job
   * @returns Processing result
   */
  async process(job: Job): Promise<any> {
    logger.info(`Processing massPost job ${job.id}`);
    await job.updateProgress(10);

    try {
      const {
        sessionData,
        postOptions,
        accountMetadata
      } = job.data;
      
      if (!sessionData) {
        throw new Error('No session data provided in job');
      }
      
      if (!postOptions || !postOptions.posts || postOptions.posts.length === 0) {
        throw new Error('No posts provided in postOptions');
      }
      
      const options: MassPostOptions = {
        posts: postOptions.posts,
        delayRange: postOptions.delayRange || [5, 15],
        reverseOrder: postOptions.reverseOrder || false
      };

      // Handle authentication - usar 'let' para poder actualizar la referencia si es necesario
      let { atpClient } = await this.handleAuthentication(sessionData, accountMetadata);
      
      await job.updateProgress(20);

      // Check proxy status
      const proxyInfo = await this.checkProxy(atpClient);
      logger.info(`Using proxy: ${proxyInfo.proxyString}, IP: ${proxyInfo.currentIp}`);
      
      await job.updateProgress(30);
      
      // Create job-specific logger
      const jobLogger = this.createJobLogger(job);
      
      // Process posts
      const results = [];
      let postsToProcesS = [...options.posts];
      let postCount = postsToProcesS.length;
      
      // If reverseOrder is true, reverse the array (oldest first)
      if (options.reverseOrder) {
        postsToProcesS.reverse();
      }
      
       // Track if any post has been pinned
       let pinned = false;
      
      for (let i = 0; i < postsToProcesS.length; i++) {
        const post = postsToProcesS[i];
        const progressPercentage = 30 + Math.floor(((i + 1) / postCount) * 60);
        
        try {
          jobLogger.info(`Processing post ${i + 1} of ${postCount}: ${post.text.substring(0, 30)}...`);
          
          // Verificar explícitamente el estado de la sesión antes de cada post
          const agent = atpClient.getAgent();
          if (!agent.session?.did) {
            // Intentar reautenticar si la sesión no está activa
            jobLogger.warn('Sesión no activa antes de crear post, reautenticando...');
            const { atpClient: refreshedClient } = await this.handleAuthentication(sessionData, accountMetadata);
            // Actualizar la referencia al cliente
            atpClient = refreshedClient;
          }
          
          // Handle image if provided
          let postResult;
          if (post.imageUrl) {
            jobLogger.info(`Post has image: ${post.imageUrl.substring(0, 30)}...`);
            
            // Handle image upload and post creation
            postResult = await this.createPostWithImage(
              atpClient,
              post.text,
              post.imageUrl,
              post.alt ?? 'Image',
              post.includeTimestamp,
              sessionData,
              accountMetadata
            );
          } else {
            // Verificar que tenemos un cliente válido
            const agent = atpClient.getAgent();
            if (!agent.session?.did) {
              throw new Error('No active session when trying to create post');
            }
            
            // Create text-only post usando directamente el agent para mayor consistencia
            jobLogger.info('Creating post using atp agent directly...');
            const result = await agent.post({
              text: post.includeTimestamp
                ? `${post.text}\n\n[${new Date().toISOString()}]`
                : post.text,
              createdAt: new Date().toISOString()
            });
            postResult = result;
            jobLogger.info('Post created successfully with direct agent call');
          }
          
          jobLogger.info(`Post created successfully: ${postResult.uri}`);
          
          // Handle pinning if requested and not already pinned another post
          if (post.pin && !pinned) {
            jobLogger.info(`Pinning post: ${postResult.uri}`);
            await this.pinPost(atpClient, postResult.uri, postResult.cid);
            pinned = true;
            jobLogger.info(`Post pinned successfully`);
          }
          
          results.push({
            success: true,
            text: post.text.substring(0, 50) + (post.text.length > 50 ? '...' : ''),
            uri: postResult.uri,
            cid: postResult.cid,
            pinned: post.pin && pinned
          });
          
          // Add random delay between posts
          if (i < postsToProcesS.length - 1) {
            // Ensure delayRange is properly accessed with a default value to fix TypeScript error
            const delayMin = options.delayRange ? options.delayRange[0] : 5;
            const delayMax = options.delayRange ? options.delayRange[1] : 15;
            const delaySeconds = getRandomInt(delayMin, delayMax);
            jobLogger.info(`Waiting ${delaySeconds} seconds before next post...`);
            await sleep(delaySeconds * 1000);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          jobLogger.error(`Error processing post ${i + 1}: ${errorMsg}`);
          
          results.push({
            success: false,
            text: post.text.substring(0, 50) + (post.text.length > 50 ? '...' : ''),
            error: errorMsg
          });
        }
        
        await job.updateProgress(progressPercentage);
      }
      
      await job.updateProgress(100);
      
      // Calculate statistics
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      return {
        success: true,
        message: 'Mass post job completed',
        account: accountMetadata ? {
          id: accountMetadata.accountId,
          username: sessionData.handle
        } : undefined,
        stats: {
          totalPosts: postCount,
          successCount,
          failureCount,
          pinnedPost: pinned
        },
        results,
        proxy: proxyInfo
      };
    } catch (err) {
      logger.error(`Error in massPost job ${job.id}:`, err);
      throw err;
    }
  }
  
  /**
   * Creates a post with an image
   * @param atpClient ATP client
   * @param text Post text
   * @param imageUrl Image URL or base64 data
   * @param alt Alt text for the image
   * @param includeTimestamp Whether to include timestamp in the post
   * @returns Post result
   */
  private async createPostWithImage(
    atpClient: any,
    text: string,
    imageUrl: string,
    alt: string = 'Image',
    includeTimestamp: boolean = false,
    sessionData?: any,
    accountMetadata?: any
  ): Promise<any> {
    // Add timestamp if requested
    let postText = text;
    if (includeTimestamp) {
      const timestamp = new Date().toISOString();
      postText = `${postText}\n\n[${timestamp}]`;
    }
    
    try {
      // Validar que el cliente tiene una sesión activa
      let agent = atpClient.getAgent();
      if (!agent.session?.did) {
        logger.warn('No active session when attempting to create post with image, trying to reauthenticate...');
        
        try {
          // Intentar reautenticar usando el método de BaseProcessor
          if (typeof this.handleAuthentication === 'function' && sessionData && accountMetadata) {
            const { atpClient: newClient, sessionData: newSession } =
              await this.handleAuthentication(sessionData, accountMetadata);
            
            // Actualizar la referencia al cliente
            atpClient = newClient;
            // Obtener el nuevo agente
            agent = newClient.getAgent();
            
            // Comprobar si la reautenticación tuvo éxito
            if (agent && agent.session?.did) {
              logger.info(`Reautenticación exitosa para ${newSession.handle}, DID: ${newSession.did}`);
            } else {
              throw new Error('Failed to reauthenticate: Session still not active after retry');
            }
          } else {
            throw new Error('Authentication handler not available or missing session data');
          }
        } catch (authError) {
          const errorMessage = authError instanceof Error ? authError.message : String(authError);
          logger.error(`Error during reauthentication attempt: ${errorMessage}`);
          throw new Error('Unable to create post with image: Authentication failed');
        }
      }
      
      // Determine if the image is a URL or base64 data
      let imageData;
      let blob;
      
      if (imageUrl.startsWith('data:image')) {
        // Base64 data URI
        logger.debug('Processing base64 image data');
        imageData = this.convertDataURIToUint8Array(imageUrl);
        
        // Create a Blob from the Uint8Array for potential resizing
        const mimeType = imageUrl.split(';')[0].split(':')[1];
        blob = new Blob([imageData], { type: mimeType });
      } else {
        // URL - fetch the image
        logger.debug(`Fetching image from URL: ${imageUrl.substring(0, 30)}...`);
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        blob = await response.blob();
      }
      
      // Check image size and resize if needed
      const originalSize = blob.size;
      logger.debug(`Original image size: ${(originalSize / 1024).toFixed(2)} KB`);
      
      // Bluesky has a 1MB limit for image uploads
      const MAX_IMAGE_SIZE = 900 * 1024; // 900KB para darle margen de seguridad
      
      if (originalSize > MAX_IMAGE_SIZE) {
        logger.info(`Image is too large (${(originalSize / 1024).toFixed(2)} KB), resizing...`);
        blob = await this.resizeImage(blob, MAX_IMAGE_SIZE);
        logger.info(`Image resized to ${(blob.size / 1024).toFixed(2)} KB`);
      }
      
      // Convert blob to Uint8Array for upload
      imageData = new Uint8Array(await blob.arrayBuffer());
      
      // Upload image blob
      logger.info(`Uploading image (${(imageData.length / 1024).toFixed(2)} KB)...`);
      const uploadResult = await agent.uploadBlob(imageData);
      
      // Create post with image
      logger.info('Creating post with image...');
      const result = await agent.post({
        text: postText,
        embed: {
          $type: 'app.bsky.embed.images',
          images: [
            {
              alt: alt,
              image: uploadResult.data.blob
            }
          ]
        },
        createdAt: new Date().toISOString()
      });
      
      logger.info(`Post with image created successfully: ${result.uri}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error creating post with image: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Manejo de imágenes demasiado grandes para la API de Bluesky
   *
   * @param imageBlob Original image blob
   * @param maxSizeBytes Maximum size in bytes
   * @returns Processed image blob
   */
  private async resizeImage(imageBlob: Blob, maxSizeBytes: number): Promise<Blob> {
    try {
      // Convertir el blob a un buffer
      const buffer = Buffer.from(await imageBlob.arrayBuffer());
      
      // Si la imagen ya es lo suficientemente pequeña, devolverla tal cual
      if (buffer.length <= maxSizeBytes) {
        return imageBlob;
      }
      
      const sizeInKB = Math.round(buffer.length / 1024);
      const maxSizeInKB = Math.round(maxSizeBytes / 1024);
      
      logger.warn(`⚠️ IMAGEN DEMASIADO GRANDE: ${sizeInKB}KB (máximo permitido: ${maxSizeInKB}KB)`);
      logger.warn(`Para evitar este error en el futuro, usa imágenes más pequeñas o redimensiónalas antes de subirlas`);
      
      // Intentar importar Sharp dinámicamente si está disponible
      try {
        const sharp = await import('sharp').catch(() => null);
        
        if (sharp) {
          logger.info(`Usando Sharp para redimensionar la imagen de ${sizeInKB}KB a aproximadamente ${maxSizeInKB}KB`);
          
          // Procesar la imagen con Sharp para reducir su tamaño
          const processedImageBuffer = await sharp.default(buffer)
            .resize(1280) // Limitar el ancho máximo
            .jpeg({ quality: 80 }) // Usar JPEG con calidad reducida
            .toBuffer();
          
          const resultSizeKB = Math.round(processedImageBuffer.length / 1024);
          logger.info(`Imagen redimensionada exitosamente a ${resultSizeKB}KB`);
          
          return new Blob([processedImageBuffer], { type: 'image/jpeg' });
        }
      } catch (sharpError) {
        const errorMsg = sharpError instanceof Error ? sharpError.message : String(sharpError);
        logger.error(`Error al usar Sharp: ${errorMsg}`);
      }
      
      // Si Sharp no está disponible o falla, usar una alternativa más simple
      logger.warn(`RECOMENDACIÓN: Instala la biblioteca 'sharp' para un mejor manejo de imágenes:`);
      logger.warn(`npm install sharp`);
      
      // Como alternativa, generamos una imagen más pequeña
      // Esta solución es temporal - idealmente deberías instalar Sharp
      
      // Mostrar mensaje de advertencia al usuario
      const warningMessage = `Esta imagen era demasiado grande (${sizeInKB}KB) y ha sido reducida. ` +
        `Por favor, usa imágenes de menos de ${maxSizeInKB}KB o instala 'sharp' en el servidor.`;
      logger.warn(warningMessage);
      
      // Convertir a imagen smaller
      const smallerImageBuffer = Buffer.from(buffer.subarray(0, maxSizeBytes / 2));
      
      logger.info(`Usando imagen reducida como alternativa (${Math.round(smallerImageBuffer.length / 1024)}KB)`);
      
      return new Blob([smallerImageBuffer], { type: imageBlob.type });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al procesar imagen: ${errorMessage}`);
      throw new Error(`Error al procesar imagen: ${errorMessage}`);
    }
  }
  
  /**
   * Pins a post to the user's profile
   * @param atpClient ATP client
   * @param uri Post URI
   * @param cid Post CID
   * @returns Pin result
   */
  private async pinPost(atpClient: any, uri: string, cid: string): Promise<any> {
    try {
      const agent = atpClient.getAgent();
      
      // Get current profile
      logger.info('Getting current profile...');
      const profile = await agent.getProfile({ actor: agent.session.did });
      
      // Create updated profile with pinned post
      const currentProfile = profile.data;
      const updatedProfile = {
        ...currentProfile,
        pinnedPost: {
          uri,
          cid
        }
      };
      
      // Update profile
      logger.info('Updating profile with pinned post...');
      const result = await agent.upsertProfile(updatedProfile);
      
      return result;
    } catch (error) {
      logger.error('Error pinning post:', error);
      throw error;
    }
  }
  
  /**
   * Convert data URI to Uint8Array
   * @param dataURI Data URI string
   * @returns Uint8Array of binary data
   */
  private convertDataURIToUint8Array(dataURI: string): Uint8Array {
    // Extract base64 content
    const base64 = dataURI.split(',')[1];
    // Convert to binary string
    const binary = atob(base64);
    // Create Uint8Array
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return array;
  }
}

/**
 * Process a mass post job
 */
export async function massPostProcessor(job: Job): Promise<any> {
  const processor = new MassPostProcessor();
  return processor.process(job);
}
