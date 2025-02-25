// src/minimal-bot.ts
console.log('Iniciando bot minimalista TypeScript...');

import dotenv from 'dotenv';
import * as AtpApi from '@atproto/api';
const { BskyAgent } = AtpApi;

console.log('Módulos importados correctamente');

// Cargar variables de entorno
dotenv.config();
console.log('Variables de entorno cargadas');

const username = process.env.BSKY_USERNAME;
const password = process.env.BSKY_PASSWORD;

console.log(`Credenciales: ${username ? 'Usuario disponible' : 'Usuario NO disponible'}, ${password ? 'Contraseña disponible' : 'Contraseña NO disponible'}`);

async function main() {
  try {
    console.log('Función principal iniciada');
    
    // Crear agente
    const agent = new BskyAgent({
      service: 'https://bsky.social'
    });
    
    console.log('Agente creado correctamente');
    
    // Iniciar sesión
    if (!username || !password) {
      throw new Error('BSKY_USERNAME o BSKY_PASSWORD no definidos');
    }
    
    console.log(`Intentando iniciar sesión como ${username}...`);
    
    const loginResult = await agent.login({
      identifier: username,
      password: password
    });
    
    console.log('Sesión iniciada correctamente');
    console.log('DID:', loginResult.data.did);
    console.log('Handle:', loginResult.data.handle);
    
    // Crear post
    console.log('Creando post de prueba...');
    
    const post = await agent.post({
      text: 'Post de prueba desde bot minimalista TypeScript 🤖',
      createdAt: new Date().toISOString()
    });
    
    console.log('Post creado correctamente');
    console.log('URI:', post.uri);
    
  } catch (error: any) {
    console.error('ERROR:', error);
    if (error.message) console.error('Mensaje de error:', error.message);
    if (error.stack) console.error('Stack trace:', error.stack);
    if (error.response) console.error('Respuesta de error:', error.response?.data || error.response);
    process.exit(1);
  }
}

console.log('Llamando a la función principal...');
main()
  .then(() => {
    console.log('Bot minimalista TypeScript completado con éxito.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error no capturado:', error);
    process.exit(1);
  });
