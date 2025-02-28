  // src/utils/logger.ts
  import { LogLevel } from '../types/index.ts';

  /**
   * Configuración del logger
   */
  interface LoggerConfig {
    level: LogLevel;
    useColors: boolean;
    showTimestamp: boolean;
  }

  /**
   * Implementación simple de un logger
   */
  class Logger {
    private config: LoggerConfig = {
      level: LogLevel.INFO,
      useColors: true,
      showTimestamp: true
    };

    /**
     * Configura el logger
     * @param config Configuración parcial para actualizar
     */
    configure(config: Partial<LoggerConfig>): void {
      this.config = { ...this.config, ...config };
    }

    /**
     * Establece el nivel de log
     * @param level Nivel de log
     */
    setLevel(level: LogLevel): void {
      this.config.level = level;
    }

    /**
     * Log de error
     * @param message Mensaje principal
     * @param args Argumentos adicionales
     */
    error(message: string, ...args: any[]): void {
      if (this.config.level >= LogLevel.ERROR) {
        this.log('ERROR', message, args, this.config.useColors ? '\x1b[31m' : undefined);
      }
    }

    /**
     * Log de advertencia
     * @param message Mensaje principal
     * @param args Argumentos adicionales
     */
    warn(message: string, ...args: any[]): void {
      if (this.config.level >= LogLevel.WARN) {
        this.log('WARN', message, args, this.config.useColors ? '\x1b[33m' : undefined);
      }
    }

    /**
     * Log informativo
     * @param message Mensaje principal
     * @param args Argumentos adicionales
     */
    info(message: string, ...args: any[]): void {
      if (this.config.level >= LogLevel.INFO) {
        this.log('INFO', message, args, this.config.useColors ? '\x1b[36m' : undefined);
      }
    }

    /**
     * Log de depuración
     * @param message Mensaje principal
     * @param args Argumentos adicionales
     */
    debug(message: string, ...args: any[]): void {
      if (this.config.level >= LogLevel.DEBUG) {
        this.log('DEBUG', message, args, this.config.useColors ? '\x1b[90m' : undefined);
      }
    }

    /**
     * Implementación interna del log
     * @param level Nivel como string
     * @param message Mensaje principal
     * @param args Argumentos adicionales
     * @param color Código de color ANSI (opcional)
     */
    private log(level: string, message: string, args: any[], color?: string): void {
      const timestamp = this.config.showTimestamp ? new Date().toISOString() : '';
      const prefix = `[${timestamp}] [${level}]`;
      
      if (color) {
        console.log(color, prefix, message, ...args, '\x1b[0m');
      } else {
        console.log(prefix, message, ...args);
      }
    }
  }

  // Exportar una instancia única del logger
  const logger = new Logger();
  export default logger;
