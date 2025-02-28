// src/examples/debug-basicBot.ts
import dotenv from 'dotenv';
import path from 'path';
import pkg from '@atproto/api';
// Robust import with fallback
const BskyAgent = (pkg as any).BskyAgent;
import { HttpProxyAgent } from 'http-proxy-agent';

// Enhanced error logging
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('=== INICIO DEBUG SCRIPT ===');
console.log('Importing modules...');

// Debug import information
console.log('BskyAgent:', BskyAgent);

// Load environment variables with more robust error handling
try {
  const envPath = path.resolve(process.cwd(), '.env');
  dotenv.config({ path: envPath });
  console.log('Environment variables loaded successfully');
} catch (error) {
  console.error('Error loading .env file:', error);
  process.exit(1);
}

// Verify critical variables
const username = process.env.BSKY_USERNAME;
const password = process.env.BSKY_PASSWORD;
console.log(`Credentials: ${username ? 'User available' : 'User NOT available'}, ${password ? 'Password available' : 'Password NOT available'}`);

// Proxy configuration with more detailed logging
const proxyConfig = {
  host: process.env.PROXY_HOST ?? 'ultra.marsproxies.com',
  port: parseInt(process.env.PROXY_PORT ?? '44443'),
  username: process.env.PROXY_USERNAME ?? 'mr45604xmD3',
  password: process.env.PROXY_PASSWORD ?? 'M3AYECLDDO_country-us_session-qrn7anm9_lifetime-168h_ultraset-1',
  protocol: process.env.PROXY_PROTOCOL ?? 'http'
};

console.log('Configuring proxy...');
const proxyUrl = `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
const proxyAgent = new HttpProxyAgent(proxyUrl);

// Global fetch proxy configuration
console.log('Configuring global proxy...');
const originalFetch = global.fetch;
// @ts-ignore
global.fetch = function(url, init) {
  try {
    if (typeof url === 'string') {
      // @ts-ignore
      return originalFetch(url, { ...init, agent: proxyAgent });
    }
    return originalFetch(url, init);
  } catch (error) {
    console.error('Error in proxied fetch:', error);
    throw error;
  }
};

// IP verification function with enhanced error handling
async function checkIP() {
  try {
    console.log('Checking IP...');
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    console.log('Current IP:', data.ip);
    return data.ip;
  } catch (error) {
    console.error('Error checking IP:', error);
    return 'IP check failed';
  }
}

async function main() {
  try {
    console.log('Main function started');
    
    // Verify IP
    await checkIP();
    
    // Verify BskyAgent
    if (!BskyAgent) {
      throw new Error('BskyAgent is not defined');
    }
    
    // Create Bluesky agent
    console.log('Creating Bluesky agent...');
    const agent = new BskyAgent({
      service: 'https://bsky.social'
    });
    
    console.log('Agent created successfully');
    
    // Login validation
    if (!username || !password) {
      throw new Error('BSKY_USERNAME or BSKY_PASSWORD not defined');
    }
    
    console.log(`Attempting to log in as ${username}...`);
    
    const loginResult = await agent.login({
      identifier: username,
      password: password
    });
    
    console.log('Login successful');
    console.log('DID:', loginResult.data.did);
    console.log('Handle:', loginResult.data.handle);
    
    // Create test post
    console.log('Creating test post...');
    
    const post = await agent.post({
      text: 'Test post from debug bot with proxy 🤖',
      createdAt: new Date().toISOString()
    });
    
    console.log('Post created successfully');
    console.log('URI:', post.uri);
    
    // Fetch timeline
    console.log('Fetching timeline...');
    const timeline = await agent.getTimeline({ limit: 5 });
    
    console.log(`Retrieved ${timeline.data.feed.length} timeline posts`);
    
    // Display some posts with type safety
    for (let i = 0; i < Math.min(timeline.data.feed.length, 3); i++) {
      const item = timeline.data.feed[i];
      // Type-safe access to post text
      const postText = (item.post?.record as { text?: string })?.text ?? 'No text available';
      const authorHandle = item.post?.author?.handle || 'Unknown user';
      
      console.log(`[${i+1}] @${authorHandle}: "${postText.substring(0, 50)}..."`);
    }
    
  } catch (error: any) {
    console.error('FATAL ERROR:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    if (error.response) {
      console.error('Response error:', error.response?.data || error.response);
    }
    process.exit(1);
  }
}

console.log('Calling main function...');
main()
  .then(() => {
    console.log('Debug Bot completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unhandled error in main:', error);
    process.exit(1);
  });
