// src/app.ts
import dotenv from 'dotenv';
import path from 'path';
import { startServer, stopServer } from './server/apiServer.js';
import { closeAllQueues } from './services/queueService.js';
import { closeRedisConnections } from './config/redis.js';
import logger from './utils/logger.js';
import { LogLevel } from './types/index.js';

// Cargar variables de entorno
try {
  const envPath = path.resolve(process.cwd(), '.env');
  logger.debug(`Loading environment variables from ${envPath}`);

  const result = dotenv.config({ path: envPath });
  if (result.error) {
    throw result.error;
  }

  logger.info('Environment variables loaded successfully');
} catch (error) {
  logger.error('Error loading .env file:', error);
  process.exit(1);
}

// Configurar nivel de log
const logLevelString = process.env.LOG_LEVEL || 'info';
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

    const port = parseInt(process.env.PORT || '3000');
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
