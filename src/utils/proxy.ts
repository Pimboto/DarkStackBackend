// src/utils/proxy.ts
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { ProxyConfig } from '../types.js';

export class ProxyManager {
  private readonly agent: HttpProxyAgent<string> | HttpsProxyAgent<string>;

  constructor(private readonly config: ProxyConfig) {
    // Build the proxy URL in the correct format:
    const proxyUrl = `${config.protocol}://${config.username}:${config.password}@${config.host}:${config.port}`;
    this.agent =
      config.protocol === 'https'
        ? new HttpsProxyAgent(proxyUrl)
        : new HttpProxyAgent(proxyUrl);
  }

  getAgent() {
    return this.agent;
  }

  getProxyString(): string {
    // Devolver una versión segura del string del proxy (ocultando la contraseña)
    return `${this.config.protocol}://${this.config.username}:****@${this.config.host}:${this.config.port}`;
  }
}
