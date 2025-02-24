// src/simple-skyware.ts
import dotenv from 'dotenv';
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
  console.log('Iniciando test simple de Skyware...');

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
    
    // Importar Skyware Bot dinámicamente
    console.log('Importando @skyware/bot...');
    const Skyware = await import('@skyware/bot');
    console.log('Skyware importado correctamente');
    
    // Crear una instancia del bot
    console.log('Creando instancia de Bot...');
    const bot = new Skyware.Bot({
      service: 'https://bsky.social'
    });
    
    // Iniciar sesión
    const username = process.env.BSKY_USERNAME;
    const password = process.env.BSKY_PASSWORD;
    
    if (!username || !password) {
      throw new Error('Faltan las variables de entorno BSKY_USERNAME o BSKY_PASSWORD');
    }
    
    console.log(`Iniciando sesión como ${username}...`);
    await bot.login({
      identifier: username,
      password: password
    });
    
    console.log('Sesión iniciada correctamente');
    console.log('Handle:', bot.profile.handle);
    
    // Crear post
    console.log('Creando post de prueba...');
    const post = await bot.post({
      text: 'Prueba simple de Skyware bot con proxy 🤖'
    });
    
    console.log('Post creado exitosamente');
    console.log('URI:', post.uri);
    
    console.log('Test simple de Skyware finalizado correctamente');
  } catch (error) {
    console.error('Error en el test de Skyware:', error);
    if (error instanceof Error) {
      console.error('Mensaje de error:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

// Ejecutar el test
main();
