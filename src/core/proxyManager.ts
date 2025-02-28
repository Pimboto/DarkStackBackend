// src/core/proxyManager.ts
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { ProxyConfig, ProxyInfo } from '../types/index.js';
import { getProxyConfig } from '../config/config.js';
import logger from '../utils/logger.js';

/**
 * Clase para gestionar la configuración y uso de proxies
 */
class ProxyManager {
  private readonly agent: HttpProxyAgent<string> | HttpsProxyAgent<string>;
  private readonly config: ProxyConfig;
  private readonly originalFetch: typeof fetch;

  /**
   * Crea una nueva instancia del gestor de proxies
   * @param config Configuración del proxy (opcional, usa valores por defecto si no se proporciona)
   */
  constructor(config?: ProxyConfig) {
    this.config = config || getProxyConfig();
    
    // Construir la URL del proxy
    const proxyUrl = this.buildProxyUrl();
    
    // Crear el agente adecuado según el protocolo
    this.agent = this.config.protocol === 'https'
      ? new HttpsProxyAgent(proxyUrl)
      : new HttpProxyAgent(proxyUrl);
      
    // Guardar referencia al fetch original
    this.originalFetch = global.fetch;
    
    logger.debug('Proxy manager initialized');
  }

  /**
   * Construye la URL del proxy a partir de la configuración
   * @returns URL del proxy en formato string
   */
  private buildProxyUrl(): string {
    return `${this.config.protocol}://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}`;
  }

  /**
   * Aplica el proxy a todas las peticiones fetch globales
   */
  setupGlobalProxy(): void {
    const agent = this.agent;
    const originalFetch = this.originalFetch;
    
    // @ts-ignore
    global.fetch = function(url, init) {
      if (typeof url === 'string') {
        // @ts-ignore
        return originalFetch(url, { ...init, agent });
      }
      return originalFetch(url, init);
    };
    
    logger.info('Global proxy configured successfully');
  }

  /**
   * Restaura la función fetch original
   */
  restoreOriginalFetch(): void {
    global.fetch = this.originalFetch;
    logger.debug('Original fetch function restored');
  }

  /**
   * Obtiene el agente de proxy para uso manual en peticiones específicas
   * @returns El agente de proxy
   */
  getAgent(): HttpProxyAgent<string> | HttpsProxyAgent<string> {
    return this.agent;
  }

  /**
   * Obtiene una versión segura de la configuración del proxy (oculta la contraseña)
   * @returns String con la configuración del proxy
   */
  getProxyString(): string {
    return `${this.config.protocol}://${this.config.username}:****@${this.config.host}:${this.config.port}`;
  }

  /**
   * Comprueba que el proxy está funcionando correctamente verificando la IP
   * @returns Información del proxy y la IP actual
   */
  async checkProxy(): Promise<ProxyInfo> {
    try {
      logger.debug('Checking proxy status...');
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      
      const proxyInfo = {
        proxyString: this.getProxyString(),
        currentIp: data.ip
      };
      
      logger.info(`Proxy check successful. Current IP: ${data.ip}`);
      return proxyInfo;
    } catch (error) {
      logger.error('Error checking proxy:', error);
      return {
        proxyString: 'Error getting proxy info',
        currentIp: 'Error getting IP'
      };
    }
  }
}

export default ProxyManager;
