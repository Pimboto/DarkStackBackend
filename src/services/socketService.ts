// src/services/socketService.ts
import { Server as SocketServer, Socket } from 'socket.io';
import http from 'http';
import logger from '../utils/logger.ts';

// Singleton para la instancia de Socket.IO
let io: SocketServer | null = null;

// Cache para almacenar el último estado de cada job
const jobStateCache = new Map<string, JobEventData>();

// Limitador para logs (solo mantener los últimos N logs por job)
const MAX_CACHED_LOGS = 100;
const jobLogsCache = new Map<string, Array<{
  timestamp: string;
  level: string;
  message: string;
}>>();

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
  status?: 'pending' | 'running' | 'completed' | 'failed';
  completedActions?: number;
  totalActions?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Registro de clientes visualizando jobs específicos
interface ClientSubscription {
  socketId: string;
  userId: string;
  activeJobs: Set<string>;
  activeGroups: Set<string>;
}

// Mapa de suscripciones por socketId
const clientSubscriptions = new Map<string, ClientSubscription>();

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
    
    // Inicializar la suscripción del cliente
    clientSubscriptions.set(socket.id, {
      socketId: socket.id,
      userId,
      activeJobs: new Set<string>(),
      activeGroups: new Set<string>()
    });
    
    // Unir al socket a la sala del usuario
    socket.join(`user:${userId}`);
    
    // Endpoint para obtener el estado inicial de un job
    socket.on('get-job-state', (data: { jobId: string }, callback) => {
      const { jobId } = data;
      const state = jobStateCache.get(jobId);
      const logs = jobLogsCache.get(jobId) || [];
      
      if (state) {
        callback({
          success: true,
          state,
          logs: logs.slice(-50) // Enviar solo los últimos 50 logs inicialmente
        });
      } else {
        callback({ success: false, message: 'Job no encontrado' });
      }
    });
    
    // Monitorear un job específico
    socket.on('monitor-job', (data: { jobId: string; jobType: string }) => {
      const { jobId, jobType } = data;
      logger.debug(`Usuario ${userId} monitoreando job ${jobId} de tipo ${jobType}`);
      
      // Unir el socket a la sala del job
      socket.join(`job:${jobId}`);
      
      // Actualizar el registro de suscripción del cliente
      const subscription = clientSubscriptions.get(socket.id);
      if (subscription) {
        subscription.activeJobs.add(jobId);
      }
      
      // Enviar el estado actual del job si existe en la caché
      const state = jobStateCache.get(jobId);
      if (state) {
        socket.emit('job:state', state);
      }
    });
    
    // Monitorear un grupo de jobs por parentId
    socket.on('monitor-job-group', (data: { parentId: string }) => {
      const { parentId } = data;
      logger.debug(`Usuario ${userId} monitoreando grupo de jobs con parentId ${parentId}`);
      
      // Unir el socket a la sala del grupo
      socket.join(`group:${parentId}`);
      
      // Actualizar el registro de suscripción del cliente
      const subscription = clientSubscriptions.get(socket.id);
      if (subscription) {
        subscription.activeGroups.add(parentId);
      }
      
      // Enviar estados actuales de los jobs en este grupo
      Array.from(jobStateCache.values())
        .filter(state => state.parentId === parentId)
        .forEach(state => {
          socket.emit('job:state', state);
        });
    });
    
    // Dejar de monitorear un job
    socket.on('unmonitor-job', (data: { jobId: string }) => {
      const { jobId } = data;
      logger.debug(`Usuario ${userId} dejó de monitorear job ${jobId}`);
      
      // Salir de la sala del job
      socket.leave(`job:${jobId}`);
      
      // Actualizar el registro de suscripción del cliente
      const subscription = clientSubscriptions.get(socket.id);
      if (subscription) {
        subscription.activeJobs.delete(jobId);
      }
    });
    
    // Solicitar logs de un job específico
    socket.on('request-job-logs', (data: { jobId: string }, callback) => {
      const { jobId } = data;
      const logs = jobLogsCache.get(jobId) || [];
      callback({ logs });
    });
    
    // Manejar desconexiones
    socket.on('disconnect', () => {
      logger.info(`Socket desconectado: ${socket.id}`);
      
      // Limpiar suscripciones del cliente
      clientSubscriptions.delete(socket.id);
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

  // Si es un evento de log, manejarlo de forma especial
  if (eventName === 'job:log' && data.jobId && data.log) {
    handleJobLog(data);
    return;
  }

  // Para otros eventos, actualizar la caché de estado
  if (data.jobId) {
    updateJobState(eventName, data);
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

  // Enviar evento a todas las salas correspondientes, pero solo a clientes
  // que están activamente monitoreando este job o grupo
  rooms.forEach(room => {
    const socketsInRoom = io?.sockets.adapter.rooms.get(room);
    
    if (socketsInRoom) {
      socketsInRoom.forEach(socketId => {
        const subscription = clientSubscriptions.get(socketId);
        
        // Verificar si el socket está interesado en este job o grupo
        if (subscription &&
            ((data.jobId && subscription.activeJobs.has(data.jobId)) ||
             (data.parentId && subscription.activeGroups.has(data.parentId)) ||
             room.startsWith('user:'))) {
          // Emitir el evento solo a este socket
          io?.to(socketId).emit(eventName, data);
        }
      });
    }
  });
}

/**
 * Maneja un evento de log, almacenando en caché y transmitiendo selectivamente
 * @param data Datos del evento de log
 */
function handleJobLog(data: JobEventData): void {
  if (!data.jobId || !data.log) return;
  
  // Obtener o inicializar el array de logs para este job
  let logs = jobLogsCache.get(data.jobId) || [];
  
  // Añadir el nuevo log
  logs.push(data.log);
  
  // Limitar el tamaño del array (mantener solo los últimos N logs)
  if (logs.length > MAX_CACHED_LOGS) {
    logs = logs.slice(-MAX_CACHED_LOGS);
  }
  
  // Actualizar la caché
  jobLogsCache.set(data.jobId, logs);
  
  // Emitir solo a los clientes que están viendo este job específico
  const jobRoom = `job:${data.jobId}`;
  const socketsInRoom = io?.sockets.adapter.rooms.get(jobRoom);
  
  if (socketsInRoom) {
    socketsInRoom.forEach(socketId => {
      const subscription = clientSubscriptions.get(socketId);
      if (subscription && subscription.activeJobs.has(data.jobId!)) {
        io?.to(socketId).emit('job:log', data);
      }
    });
  }
}

/**
 * Actualiza el estado del job en la caché
 * @param eventName Tipo de evento
 * @param data Datos del evento
 */
function updateJobState(eventName: string, data: JobEventData): void {
  if (!data.jobId) return;
  
  // Obtener el estado actual o crear uno nuevo
  const currentState = jobStateCache.get(data.jobId) || {
    jobId: data.jobId,
    userId: data.userId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Actualizar el timestamp
  data.updatedAt = new Date().toISOString();
  
  // Actualizar el estado según el tipo de evento
  switch (eventName) {
    case 'job:added':
      // Inicializar con los datos completos
      jobStateCache.set(data.jobId, { ...data, status: 'pending' });
      break;
      
    case 'job:started':
      jobStateCache.set(data.jobId, { ...currentState, ...data, status: 'running' });
      break;
      
    case 'job:progress':
      // Para progreso, solo actualizar los campos relevantes
      jobStateCache.set(data.jobId, {
        ...currentState,
        progress: data.progress,
        completedActions: data.completedActions || currentState.completedActions,
        status: 'running',
        updatedAt: data.updatedAt
      });
      break;
      
    case 'job:completed':
      jobStateCache.set(data.jobId, {
        ...currentState,
        ...data,
        status: 'completed',
        progress: 100,
        completedActions: currentState.totalActions || data.completedActions
      });
      break;
      
    case 'job:failed':
    case 'job:error':
      jobStateCache.set(data.jobId, {
        ...currentState,
        ...data,
        status: 'failed',
        error: data.error
      });
      break;
      
    default:
      // Para otros eventos, hacer una fusión simple
      jobStateCache.set(data.jobId, { ...currentState, ...data });
  }
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
