// src/services/socketService.ts
import { Server as SocketServer, Socket} from 'socket.io';
import http from 'http';
import logger from '../utils/logger.ts';

// Singleton para la instancia de Socket.IO
let io: SocketServer | null = null;

/**
 * Interfaz para datos de eventos de jobs
 */
interface JobEventData {
  jobId?: string;
  userId: string;
  jobType?: string;
  data?: any;
  parentId?: string | null;
  progress?: number | any;
  result?: any;
  error?: string;
  queueName?: string;
  log?: {
    timestamp: string;
    level: string;
    message: string;
  };
}

/**
 * Inicializa el servicio de WebSockets
 * @param server Servidor HTTP para asociar Socket.IO
 * @returns La instancia de Socket.IO
 */
export function initializeSocketService(server: http.Server): SocketServer {
  if (io) {
    logger.warn('Socket.IO ya está inicializado, se devuelve la instancia existente');
    return io;
  }

  // Crear instancia Socket.IO con CORS habilitado
  io = new SocketServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Middleware para autenticar usuarios por ID
  io.use((socket: Socket, next) => {
    const userId = socket.handshake.auth.userId || socket.handshake.query.userId;
    if (!userId) {
      return next(new Error('User ID es requerido'));
    }
    socket.data.userId = userId;
    next();
  });

  // Manejar nuevas conexiones
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    logger.info(`Socket conectado: ${socket.id} para usuario ${userId}`);
    
    // Unir al socket a la sala del usuario
    socket.join(`user:${userId}`);
    
    // Monitorear un job específico
    socket.on('monitor-job', (data: { jobId: string; jobType: string }) => {
      const { jobId, jobType } = data;
      logger.debug(`Usuario ${userId} monitoreando job ${jobId} de tipo ${jobType}`);
      socket.join(`job:${jobId}`);
    });
    
    // Monitorear un grupo de jobs por parentId
    socket.on('monitor-job-group', (data: { parentId: string }) => {
      const { parentId } = data;
      logger.debug(`Usuario ${userId} monitoreando grupo de jobs con parentId ${parentId}`);
      socket.join(`group:${parentId}`);
    });
    
    // Dejar de monitorear un job
    socket.on('unmonitor-job', (data: { jobId: string }) => {
      const { jobId } = data;
      logger.debug(`Usuario ${userId} dejó de monitorear job ${jobId}`);
      socket.leave(`job:${jobId}`);
    });
    
    // Manejar desconexiones
    socket.on('disconnect', () => {
      logger.info(`Socket desconectado: ${socket.id}`);
    });
  });
  
  logger.info('Servicio Socket.IO inicializado correctamente');
  return io;
}

/**
 * Emite un evento de job a los clientes relevantes
 * @param eventName Nombre del evento
 * @param data Datos del evento
 */
export function emitJobEvent(eventName: string, data: JobEventData): void {
  if (!io) {
    logger.warn('Se intentó emitir un evento Socket.IO sin inicializar el servicio');
    return;
  }
  
  // Determinar a qué salas enviar el evento
  const rooms = [`user:${data.userId}`];
  
  // Si hay jobId, añadir la sala específica del job
  if (data.jobId) {
    rooms.push(`job:${data.jobId}`);
  }
  
  // Si hay parentId, añadir la sala del grupo de jobs
  if (data.parentId) {
    rooms.push(`group:${data.parentId}`);
  }
  
  // Enviar evento a todas las salas correspondientes
  rooms.forEach(room => {
    io?.to(room).emit(eventName, data);
  });
  
  // Debug
/*   logger.debug(`Emitido evento ${eventName} a ${rooms.join(', ')}`); */
}

/**
 * Cierra el servicio de WebSockets
 */
export function closeSocketService(): void {
  if (io) {
    io.disconnectSockets(true);
    io.close();
    io = null;
    logger.info('Servicio Socket.IO cerrado correctamente');
  }
}

export default {
  initializeSocketService,
  emitJobEvent,
  closeSocketService
};
