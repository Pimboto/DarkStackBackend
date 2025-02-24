// src/skyware-proxy-bot.ts
// Usar importaciones dinámicas
import { ProxyManager } from './utils/proxy.js';
import { ProxyConfig } from './types.js';
import dotenv from 'dotenv';

// Necesitamos usar dynamic import para Skyware Bot
// Ya que es un módulo ESM

dotenv.config();

export class SkywareProxyBot {
  bot: any;
  private proxyManager?: ProxyManager;

  constructor(
    proxyConfig?: ProxyConfig,
    private readonly service: string = 'https://bsky.social'
  ) {
    // Configure proxy if provided
    if (proxyConfig) {
      this.proxyManager = new ProxyManager(proxyConfig);
      // Configure proxy globally
      const proxyAgent = this.proxyManager.getAgent();
      const originalFetch = global.fetch;
      // @ts-ignore
      global.fetch = function(url: string | URL | Request, init?: RequestInit) {
        if (typeof url === 'string') {
          // @ts-ignore
          return originalFetch(url, { ...init, agent: proxyAgent });
        }
        return originalFetch(url, init);
      };

      console.log('Proxy configured successfully');
    }
  }

  async initialize() {
    console.log('Initializing SkywareProxyBot...');
    try {
      // Importar dinámicamente el módulo ESM
      console.log('Importing @skyware/bot...');
      const SkywareBot = await import('@skyware/bot');
      console.log('Import successful, setting up bot...');
      
      // Inicializar el bot después de importar el módulo
      this.bot = new SkywareBot.Bot({
        service: this.service,
        emitChatEvents: true, // Enable chat events
        eventEmitterOptions: {
          pollingInterval: 5, // Poll every 5 seconds (default)
          strategy: SkywareBot.EventStrategy.Polling // Use polling strategy
        }
      });
      
      console.log('Bot initialized successfully');
      return this;
    } catch (error) {
      console.error('Error initializing bot:', error);
      throw error;
    }
  }

  async login(identifier: string, password: string) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized. Call initialize() first.');
      }
      
      console.log(`Attempting to login as ${identifier}...`);
      await this.bot.login({
        identifier,
        password
      });
      
      console.log(`Successfully logged in as: ${this.bot.profile.handle}`);
      return this.bot.profile;
    } catch (error: any) {
      console.error('Login failed:', error.message);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async post(text: string) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized. Call initialize() first.');
      }
      
      console.log('Creating post...');
      const post = await this.bot.post({ text });
      console.log('Post created successfully');
      return post;
    } catch (error: any) {
      console.error('Post failed:', error.message);
      throw new Error(`Post failed: ${error.message}`);
    }
  }

  async setChatPreference(preference: any) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized. Call initialize() first.');
      }
      
      console.log(`Setting chat preference to: ${preference}...`);
      await this.bot.setChatPreference(preference);
      console.log(`Chat preference set to: ${preference}`);
    } catch (error: any) {
      console.error('Failed to set chat preference:', error.message);
      throw new Error(`Failed to set chat preference: ${error.message}`);
    }
  }

  // Set up event listeners for messages
  onMessage(callback: (message: any) => Promise<void>) {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    console.log('Setting up message event listener...');
    this.bot.on('message', callback);
  }

  // Set up event listeners for interactions
  onReply(callback: (reply: any) => Promise<void>) {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    console.log('Setting up reply event listener...');
    this.bot.on('reply', callback);
  }

  onMention(callback: (mention: any) => Promise<void>) {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    console.log('Setting up mention event listener...');
    this.bot.on('mention', callback);
  }

  onFollow(callback: (follow: any) => Promise<void>) {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    console.log('Setting up follow event listener...');
    this.bot.on('follow', callback);
  }

  // Get the conversation for specific user(s)
  async getConversationForMembers(didOrHandles: string[]) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized. Call initialize() first.');
      }
      
      console.log(`Getting conversation for members: ${didOrHandles.join(', ')}...`);
      return await this.bot.getConversationForMembers(didOrHandles);
    } catch (error: any) {
      console.error('Failed to get conversation:', error.message);
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  }

  async listConversations(options?: { cursor?: string }) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized. Call initialize() first.');
      }
      
      console.log('Listing conversations...');
      return await this.bot.listConversations(options);
    } catch (error: any) {
      console.error('Failed to list conversations:', error.message);
      throw new Error(`Failed to list conversations: ${error.message}`);
    }
  }

  // Check proxy status
  async checkProxy(): Promise<{ proxyString: string; currentIp: string }> {
    try {
      console.log('Checking proxy status...');
      const proxyString = this.proxyManager 
        ? `${this.proxyManager.getProxyString()}`
        : 'No proxy configured';

      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      
      return {
        proxyString,
        currentIp: data.ip
      };
    } catch (error) {
      console.error('Error checking proxy:', error);
      return {
        proxyString: 'Error getting proxy info',
        currentIp: 'Error getting IP'
      };
    }
  }

  // Remove all event listeners when shutting down
  shutdown() {
    if (this.bot) {
      console.log('Shutting down bot...');
      this.bot.removeAllListeners();
      console.log('Bot shut down successfully');
    }
  }
}
