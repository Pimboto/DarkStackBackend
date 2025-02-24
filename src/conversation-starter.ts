// src/conversation-starter.ts
import { SkywareProxyBot } from './skyware-proxy-bot.js';
import { ProxyConfig } from './types.js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

// Configure proxy
const proxyConfig: ProxyConfig = {
  host: 'ultra.marsproxies.com',
  port: 44443,
  username: 'mr45604xmD3',
  password: 'M3AYECLDDO_country-us_session-qrn7anm9_lifetime-168h_ultraset-1',
  protocol: 'http'
};

// Importar RichText dinámicamente
async function importRichText() {
  const skywareBot = await import('@skyware/bot');
  return skywareBot.RichText;
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function startConversation() {
  try {
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
    
    // Ask for user handle or DID
    rl.question('Enter user handle or DID to start a conversation: ', async (userInput) => {
      try {
        console.log(`Starting conversation with ${userInput}...`);
        const conversation = await skyBot.getConversationForMembers([userInput]);
        
        if (!conversation) {
          throw new Error('Failed to create or retrieve conversation');
        }
        
        console.log(`Conversation started with ${userInput}`);
        
        // Get conversation history
        const { messages } = await conversation.getMessages();
        
        if (messages.length > 0) {
          console.log('\nRecent messages:');
          for (const msg of messages.slice(0, 5)) {
            if ('text' in msg) {
              console.log(`${msg.sender?.did === conversation.bot.profile.did ? 'You' : 'User'}: ${msg.text}`);
            } else {
              console.log(`[Message deleted]`);
            }
          }
        } else {
          console.log('No previous messages found.');
        }
        
        // Ask for message to send
        rl.question('\nEnter a message to send (or "exit" to quit): ', async function sendMessage(message) {
          if (message.toLowerCase() === 'exit') {
            console.log('Exiting conversation...');
            rl.close();
            skyBot.shutdown();
            return;
          }
          
          try {
            // Send a simple text message
            await conversation.sendMessage({ text: message });
            console.log('Message sent successfully!');
            
            // Check if the user wants to send a rich text message with links
            rl.question('\nDo you want to send a rich text message with a link? (y/n): ', async (answer) => {
              if (answer.toLowerCase() === 'y') {
                try {
                  // Importar RichText dinámicamente
                  const RichText = await importRichText();
                  
                  // Create a rich text message with a link
                  const richText = new RichText()
                    .addText('Check out this link: ')
                    .addLink('Skyware Documentation', 'https://skyware.js.org')
                    .addText(' for more info!');
                  
                  await conversation.sendMessage({ text: richText });
                  console.log('Rich text message sent successfully!');
                } catch (error) {
                  console.error('Failed to send rich text message:', error);
                }
              }
              
              // Ask for the next message
              rl.question('\nEnter another message (or "exit" to quit): ', sendMessage);
            });
          } catch (error) {
            console.error('Failed to send message:', error);
            rl.question('\nEnter another message (or "exit" to quit): ', sendMessage);
          }
        });
      } catch (error) {
        console.error('Failed to start conversation:', error);
        rl.close();
        skyBot.shutdown();
      }
    });
  } catch (error) {
    console.error('Startup failed:', error);
    rl.close();
    process.exit(1);
  }
}

// En ESM, la comprobación del módulo principal es diferente
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startConversation();
}
