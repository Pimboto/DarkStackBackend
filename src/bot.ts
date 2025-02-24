// src/bot.ts
import { SessionManager } from './index.js';
import { ProxyConfig } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

const proxyConfig: ProxyConfig = {
  host: 'ultra.marsproxies.com',
  port: 44443,
  username: 'mr45604xmD3',
  password: 'M3AYECLDDO_country-us_session-qrn7anm9_lifetime-168h_ultraset-1',
  protocol: 'http'
};

const manager = new SessionManager('https://bsky.social', proxyConfig);

async function startBot() {
  try {
    // Verificar proxy primero
    console.log('Checking proxy configuration...');
    const proxyInfo = await manager.checkProxy();
    console.log('Current Proxy:', proxyInfo.proxyString);
    console.log('Current IP:', proxyInfo.currentIp);

    console.log('\nChecking for existing session...');
    let session = await manager.resumeSession();
    
    if (!session) {
      console.log('No existing session found.');
      const username = process.env.BSKY_USERNAME;
      const password = process.env.BSKY_PASSWORD;
      
      if (!username || !password) {
        throw new Error('Missing BSKY_USERNAME or BSKY_PASSWORD in .env file');
      }
      
      console.log(`Attempting to login as ${username}...`);
      session = await manager.login(username, password);
    }

    console.log(`Successfully logged in as: ${session.handle}`);
    
    // Create a test post
    console.log('Creating test post...');
    await manager.createPost('Hello from my bot with proxy! 🤖');
    console.log('Test post created successfully!');

  } catch (error) {
    console.error('Bot startup failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

// En ESM, la comprobación del módulo principal es diferente
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startBot();
}
