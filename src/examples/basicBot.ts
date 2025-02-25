// src/examples/basicBot.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeBsky, LogLevel, logger } from '../index.js';

// Helper to get __filename in ES modules
const __filename = fileURLToPath(import.meta.url);

// Detailed environment variable loading
try {
  const envPath = path.resolve(process.cwd(), '.env');
  console.log('Attempting to load .env from:', envPath);
  
  // Manually load and log environment variables
  const result = dotenv.config({ path: envPath });
  
  if (result.error) {
    throw result.error;
  }
  
  console.log('Environment variables loaded successfully');
  
  // Log all environment variables for debugging
  console.log('Environment Variables:');
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('BSKY_') || key.startsWith('PROXY_')) {
      console.log(`${key}: ${process.env[key]?.replace(/./g, '*')}`);
    }
  });
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
    logger.debug('Logger configured to DEBUG level');
    
    // Detailed initialization logging
    console.log('Initializing Bluesky system...');
    const initStartTime = Date.now();
    
    const { atpClient, postService } = await initializeBsky({
      autoLogin: true,
      logLevel: LogLevel.DEBUG
    });
    
    const initEndTime = Date.now();
    console.log(`Bluesky system initialized in ${initEndTime - initStartTime}ms`);
    
    // Comprehensive proxy check
    console.log('Checking proxy configuration...');
    const proxyInfo = await atpClient.checkProxy();
    console.log('Proxy Details:');
    console.log(`- Proxy String: ${proxyInfo.proxyString}`);
    console.log(`- Current IP: ${proxyInfo.currentIp}`);
    
    // Create a test post
    console.log('Attempting to create a test post...');
    const postStartTime = Date.now();
    
    const post = await postService.createPost('¡Hola desde mi bot básico con proxy! 🤖', {
      includeTimestamp: true
    });
    
    const postEndTime = Date.now();
    console.log(`Post created successfully in ${postEndTime - postStartTime}ms`);
    console.log(`Post URI: ${post.uri}`);
    
    // Fetch and display timeline
    console.log('Fetching timeline...');
    const timelineStartTime = Date.now();
    
    const timeline = await atpClient.getTimeline(10);
    
    const timelineEndTime = Date.now();
    console.log(`Timeline retrieved in ${timelineEndTime - timelineStartTime}ms`);
    console.log(`Retrieved ${timeline.feed.length} posts`);
    
    // Detailed timeline post display
    console.log('Timeline Posts:');
    timeline.feed.forEach((item: { post: { author: { handle: string }, record: { text: string }, indexedAt: string } }, index: number) => {
      console.log(`[${index + 1}] @${item.post.author.handle}:`);
      console.log(`  Text: "${item.post.record.text.substring(0, 100)}${item.post.record.text.length > 100 ? '...' : ''}"`);
      console.log(`  Created At: ${item.post.indexedAt}`);
    });
    
    console.log('=== Basic Bot Example Completed Successfully ===');
    process.exit(0);
    
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
    
    // Additional error context
    if (error.cause) {
      console.error('Error Cause:', error.cause);
    }
    
    process.exit(1);
  }
}

// Run the script only if it's the main module
if (import.meta.url === `file://${__filename}`) {
  console.log('Running basic bot as main script');
  main().catch(error => {
    console.error('Unhandled error in main execution:', error);
    process.exit(1);
  });
}

export default main;
