// src/examples/basicBot.ts
import dotenv from 'dotenv';
import path from 'path';
import { initializeBsky, LogLevel, logger } from '../index.ts';

// Load environment variables with detailed logging
try {
  const envPath = path.resolve(process.cwd(), '.env');
  console.log('Attempting to load .env from:', envPath);
  
  const result = dotenv.config({ path: envPath });
  
  if (result.error) {
    throw result.error;
  }
  
  console.log('Environment variables loaded successfully');
} catch (error) {
  console.error('FATAL: Error loading .env file:', error);
  process.exit(1);
}

// Enhanced global error handling
process.on('uncaughtException', (error) => {
  console.error('GLOBAL Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('GLOBAL Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/**
 * Ejemplo básico de bot que publica un post y obtiene el timeline
 */
async function main() {
  try {
    console.log('=== Starting Basic Bot Example ===');
    
    // Configure logger with maximum verbosity
    logger.setLevel(LogLevel.DEBUG);
    
    // Detailed initialization logging
    console.log('Initializing Bluesky system...');
    const initStartTime = Date.now();
    
    // Initialize Bluesky system with auto-login
    const { atpClient, postService } = await initializeBsky({
      autoLogin: true,
      logLevel: LogLevel.DEBUG
    });
    
    const initEndTime = Date.now();
    console.log(`Bluesky system initialized in ${initEndTime - initStartTime}ms`);
    
    // Comprehensive proxy check with detailed logging
    console.log('Checking proxy configuration...');
    const proxyInfo = await atpClient.checkProxy();
    console.log('Proxy Details:');
    console.log(`- Proxy String: ${proxyInfo.proxyString}`);
    console.log(`- Current IP: ${proxyInfo.currentIp}`);
    
    // Create a test post with enhanced logging
    console.log('Attempting to create a test post...');
    const postStartTime = Date.now();
    
    const post = await postService.createPost('¡Hola desde mi bot básico con proxy! 🤖', {
      includeTimestamp: true
    });
    
    const postEndTime = Date.now();
    console.log(`Post created successfully in ${postEndTime - postStartTime}ms`);
    console.log(`Post URI: ${post.uri}`);
    
    // Fetch and display timeline with comprehensive error handling
    console.log('Fetching timeline...');
    const timelineStartTime = Date.now();
    
    const timeline = await atpClient.getTimeline(10);
    
    const timelineEndTime = Date.now();
    console.log(`Timeline retrieved in ${timelineEndTime - timelineStartTime}ms`);
    console.log(`Retrieved ${timeline.feed.length} posts`);
    
    // Detailed timeline post display
    console.log('Timeline Posts:');
    interface PostRecord {
      text: string;
    }

    interface PostAuthor {
      handle: string;
    }

    interface Post {
      author: PostAuthor;
      record: PostRecord;
      indexedAt: string;
    }

    interface TimelineItem {
      post: Post;
    }

    timeline.feed.forEach((item: TimelineItem, index: number) => {
      try {
        console.log(`[${index + 1}] @${item.post.author.handle}:`);
        console.log(`  Text: "${item.post.record.text.substring(0, 100)}${item.post.record.text.length > 100 ? '...' : ''}"`);
        console.log(`  Created At: ${item.post.indexedAt}`);
      } catch (error) {
        console.error(`Error processing timeline item ${index + 1}:`, error);
      }
    });
    
    console.log('=== Basic Bot Example Completed Successfully ===');
    return true;
    
  } catch (error: any) {
    console.error('=== FATAL ERROR in main function ===');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    
    // Detailed error handling
    if (error.response) {
      console.error('Response Error Details:');
      console.error('- Status:', error.response?.status);
      console.error('- Data:', JSON.stringify(error.response?.data, null, 2));
    }
    
    throw error;
  }
}

// Immediately Invoked Function Expression (IIFE) to run the script
(async () => {
  try {
    console.log('Starting bot execution...');
    await main();
    console.log('Bot execution completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error in bot execution:', error);
    process.exit(1);
  }
})();

export default main;
