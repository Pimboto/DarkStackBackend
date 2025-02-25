// src/services/sessionService.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { SessionData } from '../types/index.js';
import { DEFAULT_SESSION_FILE_PATH } from '../config/config.js';
import logger from '../utils/logger.js';

/**
 * Servicio para gestionar sesiones
 */
class SessionService {
  private readonly sessionPath: string;

  /**
   * Crea una nueva instancia del servicio de sesiones
   * @param sessionFilePath Ruta al archivo de sesión
   */
  constructor(sessionFilePath: string = DEFAULT_SESSION_FILE_PATH) {
    this.sessionPath = path.resolve(process.cwd(), sessionFilePath);
    logger.debug(`Session service initialized with path: ${this.sessionPath}`);
  }

  /**
   * Guarda una sesión en el archivo
   * @param session Datos de la sesión
   */
  async saveSession(session: SessionData): Promise<void> {
    try {
      logger.debug('Saving session...');
      await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2));
      logger.info('Session saved successfully');
    } catch (error) {
      logger.error('Failed to save session:', error);
      throw error;
    }
  }

  /**
   * Carga una sesión desde el archivo
   * @returns Datos de la sesión o null si no existe
   */
  async loadSession(): Promise<SessionData | null> {
    try {
      logger.debug('Loading session...');
      const data = await fs.readFile(this.sessionPath, 'utf-8');
      const session = JSON.parse(data) as SessionData;
      logger.info('Session loaded successfully');
      return session;
    } catch (error) {
      logger.debug('No session found or error loading session:', error);
      return null;
    }
  }

  /**
   * Elimina el archivo de sesión
   */
  async clearSession(): Promise<void> {
    try {
      logger.debug('Clearing session...');
      await fs.unlink(this.sessionPath);
      logger.info('Session cleared successfully');
    } catch (error) {
      logger.error('Failed to clear session:', error);
      throw error;
    }
  }

  /**
   * Verifica si existe un archivo de sesión
   * @returns true si existe el archivo
   */
  async hasSession(): Promise<boolean> {
    try {
      logger.debug('Checking if session exists...');
      await fs.access(this.sessionPath);
      logger.debug('Session file exists');
      return true;
    } catch (error) {
      logger.debug('Session file does not exist');
      return false;
    }
  }
}

export default SessionService;
