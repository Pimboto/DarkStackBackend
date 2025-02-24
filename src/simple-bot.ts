// src/simple-bot.ts
import dotenv from 'dotenv';
import pkg from '@atproto/api';
const { BskyAgent } = pkg;
import { HttpProxyAgent } from 'http-proxy-agent';

dotenv.config();

// Configuración del proxy
const proxyConfig = {
  host: 'ultra.marsproxies.com',
  port: 44443,
  username: 'mr45604xmD3',
  password: 'M3AYECLDDO_country-us_session-qrn7anm9_lifetime-168h_ultraset-1',
  protocol: 'http'
};

async function main() {
  console.log('Iniciando bot simple...');

  try {
    // Configurar proxy
    console.log('Configurando proxy...');
    const proxyUrl = `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
    const proxyAgent = new HttpProxyAgent(proxyUrl);
    
    // Configurar proxy para fetch global
    const originalFetch = global.fetch;
    // @ts-ignore
    global.fetch = function(url, init) {
      if (typeof url === 'string') {
        // @ts-ignore
        return originalFetch(url, { ...init, agent: proxyAgent });
      }
      return originalFetch(url, init);
    };
    
    // Verificar IP
    console.log('Verificando IP actual...');
    const ipResponse = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipResponse.json();
    console.log('IP actual:', ipData.ip);
    
    // Crear agente Bluesky
    console.log('Creando agente Bluesky...');
    const agent = new BskyAgent({
      service: 'https://bsky.social'
    });
    
    // Iniciar sesión
    const username = process.env.BSKY_USERNAME;
    const password = process.env.BSKY_PASSWORD;
    
    if (!username || !password) {
      throw new Error('Faltan las variables de entorno BSKY_USERNAME o BSKY_PASSWORD');
    }
    
    console.log(`Iniciando sesión como ${username}...`);
    await agent.login({
      identifier: username,
      password: password
    });
    
    console.log('Sesión iniciada correctamente');
    console.log('DID:', agent.session?.did);
    console.log('Handle:', agent.session?.handle);
    
    // Crear post
    console.log('Creando post de prueba...');
    const post = await agent.post({
      text: 'Prueba simple de bot con proxy 🤖',
      createdAt: new Date().toISOString()
    });
    
    console.log('Post creado exitosamente');
    console.log('URI:', post.uri);
    
    console.log('Bot simple finalizado correctamente');
  } catch (error) {
    console.error('Error en el bot simple:', error);
  }
}

// Ejecutar el bot
main();
