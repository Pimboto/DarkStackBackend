// src/workers/processors/massPostProcessor.ts
import { Job } from 'bullmq';
import { initializeBsky, LogLevel } from '../../index.ts';
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

      // Handle authentication
      const { atpClient } = await this.handleAuthentication(sessionData, accountMetadata);
      
      await job.updateProgress(20);

      // Initialize services
      const { postService } = await initializeBsky({
        logLevel: LogLevel.DEBUG,
        autoLogin: false,
      });

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
              post.includeTimestamp
            );
          } else {
            // Create text-only post
            postResult = await postService.createPost(post.text, {
              includeTimestamp: post.includeTimestamp
            });
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
    includeTimestamp: boolean = false
  ): Promise<any> {
    // Add timestamp if requested
    let postText = text;
    if (includeTimestamp) {
      const timestamp = new Date().toISOString();
      postText = `${postText}\n\n[${timestamp}]`;
    }
    
    try {
      const agent = atpClient.getAgent();
      
      // Determine if the image is a URL or base64 data
      let imageData;
      if (imageUrl.startsWith('data:image')) {
        // Base64 data URI
        imageData = this.convertDataURIToUint8Array(imageUrl);
      } else {
        // URL - fetch the image
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        imageData = new Uint8Array(await blob.arrayBuffer());
      }
      
      // Upload image blob
      logger.info('Uploading image...');
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
      
      return result;
    } catch (error) {
      logger.error('Error creating post with image:', error);
      throw error;
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
