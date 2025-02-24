// src/bot-example.ts
import { SkywareProxyBot } from './skyware-proxy-bot.js';
import { ProxyConfig } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

// Importar dinámicamente para obtener IncomingChatPreference
async function importIncomingChatPreference() {
  const skywareBot = await import('@skyware/bot');
  return skywareBot.IncomingChatPreference;
}

// Configure proxy
const proxyConfig: ProxyConfig = {
  host: 'ultra.marsproxies.com',
  port: 44443,
  username: 'mr45604xmD3',
  password: 'M3AYECLDDO_country-us_session-qrn7anm9_lifetime-168h_ultraset-1',
  protocol: 'http'
};

async function startBot() {
  try {
    // Obtener IncomingChatPreference
    const IncomingChatPreference = await importIncomingChatPreference();
    
    // Initialize bot with proxy
    const skyBot = new SkywareProxyBot(proxyConfig);
    await skyBot.initialize();
    
    // Check proxy configuration
    console.log('Checking proxy configuration...');
    const proxyInfo = await skyBot.checkProxy();
    console.log('Current Proxy:', proxyInfo.proxyString);
    console.log('Current IP:', proxyInfo.currentIp);

    // Login
    const username = process.env.BSKY_USERNAME;
    const password = process.env.BSKY_PASSWORD;
      
    if (!username || !password) {
      throw new Error('Missing BSKY_USERNAME or BSKY_PASSWORD in .env file');
    }
      
    console.log(`Attempting to login as ${username}...`);
    await skyBot.login(username, password);
    
    // Set chat preference to receive messages from all users
    await skyBot.setChatPreference(IncomingChatPreference.All);
    console.log('Bot will now receive messages from all users');
    
    // Create a test post
    console.log('Creating test post...');
    await skyBot.post('Hello from my Skyware bot with proxy support! 🤖');
    console.log('Test post created successfully!');

    // Handle incoming messages
    skyBot.onMessage(async (message) => {
      console.log(`Received message: ${message.text}`);
      
      try {
        const sender = await message.getSender();
        console.log(`Message from: ${sender.handle}`);
        
        const conversation = await message.getConversation();
        if (conversation) {
          await conversation.sendMessage({ 
            text: `Hello ${sender.displayName || sender.handle}! Thanks for your message: "${message.text}"`
          });
          console.log(`Replied to ${sender.handle}`);
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    // Handle replies to posts
    skyBot.onReply(async (reply) => {
      console.log(`Received reply from ${reply.author.handle}: ${reply.text}`);
      
      try {
        // Like the reply
        await reply.like();
        console.log(`Liked reply from ${reply.author.handle}`);
        
        // Reply to the user
        await reply.reply({ 
          text: `Thanks for your reply, ${reply.author.displayName || reply.author.handle}!` 
        });
        console.log(`Replied to ${reply.author.handle}`);
      } catch (error) {
        console.error('Error handling reply:', error);
      }
    });

    // Handle mentions
    skyBot.onMention(async (mention) => {
      console.log(`Mentioned by ${mention.author.handle}: ${mention.text}`);
      
      try {
        // Like the mention
        await mention.like();
        console.log(`Liked mention from ${mention.author.handle}`);
        
        // Reply to the mention
        await mention.reply({ 
          text: `Thanks for mentioning me, ${mention.author.displayName || mention.author.handle}!` 
        });
        console.log(`Replied to mention from ${mention.author.handle}`);
      } catch (error) {
        console.error('Error handling mention:', error);
      }
    });

    console.log('Bot is now running and listening for events...');
    
    // Keep the process running
    process.on('SIGINT', () => {
      console.log('Shutting down bot...');
      skyBot.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Bot startup failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

// En ESM, la comprobación del módulo principal es diferente
// Verificamos si este archivo es el punto de entrada comparando import.meta.url
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startBot();
}
