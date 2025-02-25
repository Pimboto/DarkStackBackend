// src/services/chatService.ts
import SkywareClient from '../core/skywareClient.js';
import logger from '../utils/logger.js';

/**
 * Opciones para la configuración del manejador de mensajes
 */
interface MessageHandlerOptions {
  /**
   * Si es verdadero, responde automáticamente a los mensajes
   */
  autoReply?: boolean;
  
  /**
   * Formato del mensaje de respuesta automática
   * Variables disponibles:
   * - {{sender}}: Nombre o handle del remitente
   * - {{message}}: Mensaje recibido
   */
  replyTemplate?: string;
  
  /**
   * Callback personalizado para procesar mensajes
   */
  customHandler?: (message: any, conversation: any, sender: any) => Promise<void>;
}

/**
 * Servicio para gestionar el chat con Skyware
 */
class ChatService {
  /**
   * Preferencias de chat disponibles (serán importadas dinámicamente)
   */
  private chatPreferences: any = null;
  
  /**
   * Crea una nueva instancia del servicio de chat
   * @param skywareClient Cliente Skyware
   */
  constructor(private readonly skywareClient: SkywareClient) {}

  /**
   * Configura la preferencia de chat
   * @param preference Tipo de preferencia (All, Following, None)
   */
  async setChatPreference(preference: 'All' | 'Following' | 'None'): Promise<void> {
    try {
      // Cargar las preferencias si no están ya cargadas
      if (!this.chatPreferences) {
        const Skyware = await import('@skyware/bot');
        this.chatPreferences = Skyware.IncomingChatPreference;
      }
      
      // Obtener la preferencia correspondiente
      const preferenceValue = this.chatPreferences[preference];
      
      if (preferenceValue === undefined) {
        throw new Error(`Invalid chat preference: ${preference}`);
      }
      
      // Establecer la preferencia
      await this.skywareClient.setChatPreference(preferenceValue);
      logger.info(`Chat preference set to: ${preference}`);
    } catch (error) {
      logger.error('Error setting chat preference:', error);
      throw error;
    }
  }

  /**
   * Configura el manejador de mensajes
   * @param options Opciones de configuración
   */
  setupMessageHandler(options: MessageHandlerOptions = {}): void {
    const {
      autoReply = true,
      replyTemplate = 'Hola {{sender}}! Gracias por tu mensaje: "{{message}}"',
      customHandler
    } = options;
    
    logger.info('Setting up message handler...');
    
    this.skywareClient.onMessage(async (message) => {
      try {
        // Obtener información sobre el remitente y la conversación
        logger.info(`Message received: ${message.text}`);
        
        const sender = await message.getSender();
        logger.info(`Message from: ${sender.handle}`);
        
        const conversation = await message.getConversation();
        
        // Procesar el mensaje según las opciones
        if (customHandler) {
          // Usar manejador personalizado
          await customHandler(message, conversation, sender);
        } else if (autoReply && conversation) {
          // Usar respuesta automática con plantilla
          const senderName = sender.displayName || sender.handle;
          let replyText = replyTemplate
            .replace('{{sender}}', senderName)
            .replace('{{message}}', message.text);
          
          await conversation.sendMessage({ text: replyText });
          logger.info(`Auto-reply sent to ${sender.handle}`);
        }
      } catch (error) {
        logger.error('Error handling message:', error);
      }
    });
    
    logger.info('Message handler configured successfully');
  }

  /**
   * Configura manejadores para otros eventos
   * @param eventHandlers Objeto con los manejadores de eventos
   */
  setupEventHandlers(eventHandlers: {
    onReply?: (reply: any) => Promise<void>;
    onMention?: (mention: any) => Promise<void>;
    onFollow?: (follow: any) => Promise<void>;
  }): void {
    const { onReply, onMention, onFollow } = eventHandlers;
    
    logger.info('Setting up event handlers...');
    
    if (onReply) {
      this.skywareClient.onReply(onReply);
      logger.info('Reply handler configured');
    }
    
    if (onMention) {
      this.skywareClient.onMention(onMention);
      logger.info('Mention handler configured');
    }
    
    if (onFollow) {
      this.skywareClient.onFollow(onFollow);
      logger.info('Follow handler configured');
    }
  }

  /**
   * Inicia una conversación con un usuario
   * @param userHandle Handle o DID del usuario
   * @returns Objeto de conversación
   */
  async startConversation(userHandle: string): Promise<any> {
    try {
      logger.info(`Starting conversation with ${userHandle}...`);
      const conversation = await this.skywareClient.getConversationForMembers([userHandle]);
      logger.info('Conversation started successfully');
      return conversation;
    } catch (error) {
      logger.error('Error starting conversation:', error);
      throw error;
    }
  }

  /**
   * Obtiene las conversaciones del usuario
   * @param options Opciones de paginación
   * @returns Lista de conversaciones
   */
  async getConversations(options?: { cursor?: string }): Promise<any> {
    try {
      logger.info('Getting conversations...');
      const result = await this.skywareClient.listConversations(options);
      logger.info(`Retrieved ${result.conversations.length} conversations`);
      return result;
    } catch (error) {
      logger.error('Error getting conversations:', error);
      throw error;
    }
  }

  /**
   * Envía un mensaje a una conversación existente
   * @param conversation Objeto de conversación
   * @param text Texto del mensaje
   */
  async sendMessage(conversation: any, text: string): Promise<void> {
    try {
      logger.info('Sending message...');
      await conversation.sendMessage({ text });
      logger.info('Message sent successfully');
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }
}

export default ChatService;
