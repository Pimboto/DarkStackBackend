// src/integrated-bot.ts
import dotenv from 'dotenv';
import * as AtpApi from '@atproto/api';
const { BskyAgent } = AtpApi;
import { HttpProxyAgent } from 'http-proxy-agent';
import * as fs from 'fs/promises';
import * as path from 'path';

dotenv.config();

// Configuración del proxy
const proxyConfig = {
  host: 'ultra.marsproxies.com',
  port: 44443,
  username: 'mr45604xmD3',
  password: 'M3AYECLDDO_country-us_session-qrn7anm9_lifetime-168h_ultraset-1',
  protocol: 'http'
};

// Clase para manejar la sesión de Bluesky con soporte de proxy
class AtpSessionManager {
  private readonly agent: typeof BskyAgent.prototype;
  private readonly sessionPath: string;
  private readonly proxyAgent: HttpProxyAgent<string>;

  constructor(
    private readonly service: string = 'https://bsky.social',
    private readonly sessionFilePath: string = 'session.json'
  ) {
    this.sessionPath = path.resolve(process.cwd(), sessionFilePath);
    
    // Configurar proxy
    console.log('Configurando proxy...');
    const proxyUrl = `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
    this.proxyAgent = new HttpProxyAgent(proxyUrl);
    
    // Configurar proxy para fetch global
    const originalFetch = global.fetch;
    // @ts-ignore
    global.fetch = function(url, init) {
      if (typeof url === 'string') {
        // @ts-ignore
        return originalFetch(url, { ...init, agent: this.proxyAgent });
      }
      return originalFetch(url, init);
    }.bind(this);
    
    // Crear agente Bluesky
    this.agent = new BskyAgent({
      service: this.service,
      persistSession: (evt, sess) => {
        if (sess) {
          this.saveSession({
            did: sess.did,
            handle: sess.handle,
            email: sess.email,
            accessJwt: sess.accessJwt,
            refreshJwt: sess.refreshJwt,
          });
        }
      },
    });
  }

  async login(identifier: string, password: string) {
    try {
      const result = await this.agent.login({
        identifier,
        password
      });

      const session = {
        did: result.data.did,
        handle: result.data.handle,
        email: result.data.email,
        accessJwt: result.data.accessJwt,
        refreshJwt: result.data.refreshJwt,
      };

      await this.saveSession(session);
      return session;
    } catch (error: any) {
      console.error('Login error details:', error);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async resumeSession() {
    try {
      const session = await this.loadSession();
      if (session) {
        await this.agent.resumeSession({
          did: session.did,
          handle: session.handle,
          email: session.email,
          accessJwt: session.accessJwt,
          refreshJwt: session.refreshJwt,
        });
        return session;
      }
      return null;
    } catch (error) {
      console.error('Failed to resume session:', error);
      return null;
    }
  }

  private async saveSession(session: any) {
    try {
      await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  private async loadSession() {
    try {
      const data = await fs.readFile(this.sessionPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  getAgent() {
    return this.agent;
  }

  async createPost(text: string) {
    if (!this.agent.session?.did) {
      throw new Error('Not logged in');
    }

    return this.agent.post({
      text: text,
      createdAt: new Date().toISOString(),
    });
  }

  async checkProxy() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      
      return {
        proxyString: `${proxyConfig.protocol}://${proxyConfig.username}:****@${proxyConfig.host}:${proxyConfig.port}`,
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
}

// Clase para integrar Skyware Bot con el proxy
class SkywareChat {
  private bot: any;
  
  constructor(private readonly service: string = 'https://bsky.social') {}
  
  async initialize() {
    try {
      console.log('Inicializando Skyware Bot...');
      const Skyware = await import('@skyware/bot');
      
      // Crear instancia del bot
      this.bot = new Skyware.Bot({
        service: this.service,
        emitChatEvents: true
      });
      
      console.log('Skyware Bot inicializado correctamente');
      return this;
    } catch (error) {
      console.error('Error al inicializar Skyware Bot:', error);
      throw error;
    }
  }
  
  async login(identifier: string, password: string) {
    try {
      if (!this.bot) {
        throw new Error('Bot no inicializado. Llama a initialize() primero.');
      }
      
      await this.bot.login({
        identifier,
        password
      });
      
      console.log(`Sesión Skyware iniciada como: ${this.bot.profile.handle}`);
      return this.bot.profile;
    } catch (error: any) {
      console.error('Error al iniciar sesión en Skyware:', error);
      throw error;
    }
  }
  
  async setChatPreference(preference: any) {
    try {
      if (!this.bot) {
        throw new Error('Bot no inicializado. Llama a initialize() primero.');
      }
      
      const Skyware = await import('@skyware/bot');
      await this.bot.setChatPreference(preference);
      console.log(`Preferencia de chat establecida en: ${preference}`);
    } catch (error) {
      console.error('Error al establecer preferencia de chat:', error);
      throw error;
    }
  }
  
  onMessage(callback: (message: any) => Promise<void>) {
    if (!this.bot) {
      throw new Error('Bot no inicializado. Llama a initialize() primero.');
    }
    
    console.log('Configurando listener de mensajes...');
    this.bot.on('message', callback);
  }
  
  async getConversationForMembers(didOrHandles: string[]) {
    try {
      if (!this.bot) {
        throw new Error('Bot no inicializado. Llama a initialize() primero.');
      }
      
      return await this.bot.getConversationForMembers(didOrHandles);
    } catch (error) {
      console.error('Error al obtener conversación:', error);
      throw error;
    }
  }
  
  async listConversations(options?: { cursor?: string }) {
    try {
      if (!this.bot) {
        throw new Error('Bot no inicializado. Llama a initialize() primero.');
      }
      
      return await this.bot.listConversations(options);
    } catch (error) {
      console.error('Error al listar conversaciones:', error);
      throw error;
    }
  }
  
  shutdown() {
    if (this.bot) {
      console.log('Cerrando Skyware Bot...');
      this.bot.removeAllListeners();
    }
  }
  
  getBot() {
    return this.bot;
  }
}

// Función principal
async function main() {
  try {
    // Crear gestor de sesión ATP con proxy
    console.log('Iniciando bot integrado...');
    const atpManager = new AtpSessionManager();
    
    // Verificar configuración del proxy
    console.log('Verificando configuración del proxy...');
    const proxyInfo = await atpManager.checkProxy();
    console.log('Proxy actual:', proxyInfo.proxyString);
    console.log('IP actual:', proxyInfo.currentIp);
    
    // Intentar reanudar sesión
    console.log('Verificando sesión existente...');
    let session = await atpManager.resumeSession();
    
    if (!session) {
      console.log('No se encontró sesión existente.');
      const username = process.env.BSKY_USERNAME;
      const password = process.env.BSKY_PASSWORD;
      
      if (!username || !password) {
        throw new Error('Faltan las variables de entorno BSKY_USERNAME o BSKY_PASSWORD');
      }
      
      console.log(`Iniciando sesión como ${username}...`);
      session = await atpManager.login(username, password);
    }
    
    console.log(`Sesión iniciada correctamente como: ${session.handle}`);
    
    // Crear un post de prueba
    console.log('Creando post de prueba...');
    await atpManager.createPost('¡Hola desde mi bot integrado con proxy! 🤖');
    console.log('Post creado exitosamente');
    
    // Inicializar Skyware Chat
    console.log('Iniciando componente de chat...');
    const skywareChat = new SkywareChat();
    await skywareChat.initialize();
    
    // Iniciar sesión en Skyware (usa las mismas credenciales)
    const username = process.env.BSKY_USERNAME;
    const password = process.env.BSKY_PASSWORD;
    
    if (!username || !password) {
      throw new Error('Faltan las variables de entorno BSKY_USERNAME o BSKY_PASSWORD');
    }
    
    await skywareChat.login(username, password);
    
    // Configurar preferencia de chat para recibir mensajes de todos
    const Skyware = await import('@skyware/bot');
    await skywareChat.setChatPreference(Skyware.IncomingChatPreference.All);
    console.log('Bot configurado para recibir mensajes de todos los usuarios');
    
    // Configurar manejador de mensajes
    skywareChat.onMessage(async (message) => {
      console.log(`Mensaje recibido: ${message.text}`);
      
      try {
        const sender = await message.getSender();
        console.log(`Mensaje de: ${sender.handle}`);
        
        const conversation = await message.getConversation();
        if (conversation) {
          await conversation.sendMessage({ 
            text: `Hola ${sender.displayName || sender.handle}! Gracias por tu mensaje: "${message.text}"`
          });
          console.log(`Respuesta enviada a ${sender.handle}`);
        }
      } catch (error) {
        console.error('Error al manejar mensaje:', error);
      }
    });
    
    console.log('Bot integrado ejecutándose y escuchando mensajes...');
    
    // Mantener el proceso en ejecución
    process.on('SIGINT', () => {
      console.log('Cerrando bot...');
      skywareChat.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error en el bot integrado:', error);
    if (error instanceof Error) {
      console.error('Detalles del error:', error.message);
    }
    process.exit(1);
  }
}

// Ejecutar el bot
main();
