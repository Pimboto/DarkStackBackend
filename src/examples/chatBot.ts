// src/examples/chatBot.ts
import { initializeBsky, LogLevel } from '../index.ts';
import logger from '../utils/logger.ts';

/**
 * Ejemplo de bot que maneja conversaciones de chat
 */
async function main() {
  try {
    // Configurar el logger para mayor detalle
    logger.setLevel(LogLevel.DEBUG);
    logger.info('Starting chat bot example...');
    
    // Inicializar el sistema completo con chat habilitado
    const { chatService, postService } = await initializeBsky({
      autoLogin: true,
      enableChat: true,
      chatPreference: 'All' // Recibir mensajes de todos los usuarios
    });
    
    if (!chatService) {
      throw new Error('Chat service was not initialized properly');
    }
    
    // Crear un post de bienvenida
    logger.info('Creating welcome post...');
    await postService.createPost('¡Hola! Soy un bot de chat. Envíame un mensaje directo y te responderé automáticamente. 🤖', {
      includeTimestamp: true
    });
    
    // Configurar manejador de mensajes personalizado
    logger.info('Setting up custom message handler...');
    chatService.setupMessageHandler({
      autoReply: true,
      replyTemplate: '¡Hola {{sender}}! Gracias por tu mensaje: "{{message}}". Soy un bot de ejemplo que responde automáticamente.',
      customHandler: async (message, conversation, sender) => {
        // Este manejador personalizado se ejecuta además de la respuesta automática
        logger.info(`Processing message from ${sender.handle}: "${message.text}"`);
        
        // Ejemplo: Responder con información adicional si el mensaje contiene ciertas palabras clave
        if (message.text.toLowerCase().includes('ayuda') || 
            message.text.toLowerCase().includes('help')) {
          await conversation.sendMessage({
            text: `Hola ${sender.displayName || sender.handle}, aquí tienes algunos comandos que puedes usar:\n\n` +
                  `- "ayuda" o "help": Muestra este mensaje\n` +
                  `- "hola" o "hi": Saludo simple\n` +
                  `- "info": Información sobre este bot\n\n` +
                  `Este es un bot de ejemplo que demuestra las capacidades de chat.`
          });
        } else if (message.text.toLowerCase().includes('info')) {
          await conversation.sendMessage({
            text: `Este bot fue creado utilizando una arquitectura modular con TypeScript y ESM modules. ` +
                  `Implementa tanto la API directa de Bluesky (@atproto/api) como la biblioteca Skyware para chat.`
          });
        }
      }
    });
    
    // Configurar manejadores de eventos adicionales
    logger.info('Setting up additional event handlers...');
    chatService.setupEventHandlers({
      onReply: async (reply) => {
        logger.info(`Reply received from ${reply.author.handle}: "${reply.text}"`);
        await reply.like();
        logger.info('Liked reply');
      },
      
      onMention: async (mention) => {
        logger.info(`Mention received from ${mention.author.handle}: "${mention.text}"`);
        await mention.reply({ 
          text: `¡Gracias por mencionarme, @${mention.author.handle}! Este es un bot de ejemplo.` 
        });
        logger.info('Replied to mention');
      },
      
      onFollow: async (follow) => {
        logger.info(`New follower: ${follow.author.handle}`);
        
        // Iniciar una conversación con el nuevo seguidor
        const conversation = await chatService.startConversation(follow.author.handle);
        await chatService.sendMessage(conversation, `¡Hola @${follow.author.handle}! Gracias por seguirme. Soy un bot de ejemplo que puede responder a mensajes directos.`);
        logger.info('Sent welcome message to new follower');
      }
    });
    
    logger.info('Chat bot is now running and listening for events...');
    logger.info('Press Ctrl+C to exit.');
    
    // Mantener el proceso en ejecución
    process.on('SIGINT', () => {
      logger.info('Shutting down chat bot...');
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Error running chat bot example:', error);
    process.exit(1);
  }
}

// Ejecutar el ejemplo
if (import.meta.url.startsWith('file:')) {
  const scriptPath = process.argv[1] ? new URL(process.argv[1], 'file://').pathname : '';
  const currentPath = import.meta.url.replace('file://', '');
  
  if (currentPath === scriptPath || process.argv[1] === undefined) {
    main().catch(console.error);
  }
}

export default main;
