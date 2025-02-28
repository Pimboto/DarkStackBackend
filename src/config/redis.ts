// src/config/redis.ts
import Redis from 'ioredis';
import { getEnvVariable } from './env.ts';
import logger from '../utils/logger.ts';

/**
 * Opciones de configuración para Redis
 */
export interface RedisOptions {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  enableOfflineQueue?: boolean;
  connectTimeout?: number;
  disconnectTimeout?: number;
  retryStrategy?: (times: number) => number | void;
}

/**
 * Obtiene configuración Redis desde variables de entorno
 */
export function getRedisConfig(): RedisOptions {
  const useUrl = process.env.REDIS_USE_URL === 'true';
  
  if (useUrl) {
    const url = getEnvVariable('REDIS_URL', 'redis://localhost:6379');
    logger.debug(`Using Redis URL: ${url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
    return { url };
  }
  
  return {
    host: getEnvVariable('REDIS_HOST', 'localhost'),
    port: parseInt(getEnvVariable('REDIS_PORT', '6379')),
    username: process.env.REDIS_USERNAME ?? undefined,
    password: process.env.REDIS_PASSWORD ?? undefined,
    db: parseInt(getEnvVariable('REDIS_DB', '0')),
  };
}

/**
 * Crea una conexión configurada a Redis con estrategia de reconexión
 */
export function createRedisClient(options?: RedisOptions): Redis {
  const config = { ...getRedisConfig(), ...options };
  
  // Si tenemos URL, usamos esa, de lo contrario usamos host/port
  const redisOptions: RedisOptions = config.url ? { url: config.url } : config;
  
  // Configurar estrategia de reconexión robusta
  redisOptions.retryStrategy = (times: number) => {
    // Reintento exponencial con límite
    const delay = Math.min(Math.pow(2, times) * 100, 30000);
    logger.warn(`Redis connection lost. Attempting to reconnect (attempt ${times}) in ${delay}ms...`);
    return delay;
  };
  
  // Configuraciones adicionales para conexiones robustas
  redisOptions.maxRetriesPerRequest = 10;
  redisOptions.enableReadyCheck = true;
  redisOptions.enableOfflineQueue = true;
  redisOptions.connectTimeout = 10000;
  redisOptions.disconnectTimeout = 5000;
  
  const client = new Redis(redisOptions);
  
  // Manejar eventos de conexión
  client.on('connect', () => {
    logger.info('Redis client connected');
  });
  
  client.on('ready', () => {
    logger.info('Redis client ready');
  });
  
  client.on('error', (err) => {
    logger.error('Redis error:', err);
  });
  
  client.on('close', () => {
    logger.warn('Redis connection closed');
  });
  
  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting');
  });
  
  return client;
}

// Singleton Redis clients
let sharedConnection: Redis | null = null;

/**
 * Obtiene una conexión compartida a Redis (singleton)
 */
export function getSharedRedisConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = createRedisClient();
  }
  return sharedConnection;
}

/**
 * Cierra todas las conexiones a Redis
 */
export async function closeRedisConnections(): Promise<void> {
  if (sharedConnection) {
    logger.info('Closing shared Redis connection...');
    await sharedConnection.quit();
    sharedConnection = null;
  }
}

export default {
  getRedisConfig,
  createRedisClient,
  getSharedRedisConnection,
  closeRedisConnections
};
