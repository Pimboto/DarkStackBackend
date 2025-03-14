// src/app.ts
import dotenv from 'dotenv';
import path from 'path';
import { startServer, stopServer } from './server/apiServer.ts';
import { closeAllQueues } from './services/queueService.ts';
import { closeRedisConnections } from './config/redis.ts';
import logger from './utils/logger.ts';
import { LogLevel } from './types/index.ts';

// Cargar variables de entorno
try {
  const envPath = path.resolve(process.cwd(), '.env');
  logger.debug(`Checking for environment file at ${envPath}`);

  // Solo intentar cargar .env si estamos en desarrollo
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`Loading environment variables from ${envPath}`);
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      logger.warn('Error loading .env file:', result.error);
      logger.info('Continuing with environment variables from process.env');
    } else {
      logger.info('Environment variables loaded successfully from .env file');
    }
  } else {
    logger.info('Running in production mode, using environment variables from platform');
  }
} catch (error) {
  logger.warn('Error checking for .env file:', error);
  logger.info('Continuing with environment variables from process.env');
}

// Configurar nivel de log
const logLevelString = process.env.LOG_LEVEL ?? 'info';
const logLevelMap: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
};

logger.setLevel(logLevelMap[logLevelString] || LogLevel.INFO);

/**
 * Manejo de apagado gracioso
 */
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    // Detener servidor
    logger.debug('Stopping API server...');
    await stopServer();

    // Cerrar todas las colas
    logger.debug('Closing all queues...');
    await closeAllQueues();

    // Cerrar conexiones Redis
    logger.debug('Closing Redis connections...');
    await closeRedisConnections();

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Registrar manejadores de señales
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  // En este caso no paramos la app, solo registramos el error
});

/**
 * Punto de entrada principal
 */
async function main() {
  try {
    logger.info('Starting Bluesky Bot API Server...');

    const port = parseInt(process.env.PORT ?? '3000');
    // Iniciar servidor
    await startServer(port);

    logger.info(`Bluesky Bot API Server running at http://localhost:${port}`);
    logger.info('Press Ctrl+C to stop');
  } catch (error) {
    logger.error('Error starting application:', error);
    process.exit(1);
  }
}

// Arrancar la aplicación
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});

export default { main };
