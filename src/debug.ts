// src/debug.ts
console.log('=== SCRIPT DE DEPURACIÓN ===');
console.log('Verificando entorno...');
console.log(`Node.js version: ${process.version}`);
console.log('Importaciones básicas...');

try {
  console.log('1. Importando dotenv...');
  import('dotenv').then((dotenv) => {
    console.log('✅ dotenv importado correctamente');
    dotenv.default.config();

    console.log('\n2. Verificando variables de entorno...');
    if (process.env.BSKY_USERNAME && process.env.BSKY_PASSWORD) {
      console.log('✅ Variables de entorno BSKY_USERNAME y BSKY_PASSWORD encontradas');
    } else {
      console.log('❌ Variables de entorno BSKY_USERNAME y/o BSKY_PASSWORD no encontradas');
    }

    console.log('\n3. Importando http-proxy-agent...');
    import('http-proxy-agent').then(() => {
      console.log('✅ http-proxy-agent importado correctamente');

      console.log('\n4. Importando https-proxy-agent...');
      import('https-proxy-agent').then(() => {
        console.log('✅ https-proxy-agent importado correctamente');

        console.log('\n5. Importando @atproto/api...');
        import('@atproto/api').then((atprotoApi) => {
          console.log('✅ @atproto/api importado correctamente');
          if (atprotoApi.BskyAgent) {
            console.log('  - BskyAgent disponible');
          } else {
            console.log('  - BskyAgent NO disponible directamente, verificando estructura...');
            console.log('  - Propiedades disponibles:', Object.keys(atprotoApi));
            // Verificar si BskyAgent está disponible como default export
            if (atprotoApi.default && atprotoApi.default.BskyAgent) {
              console.log('  - BskyAgent disponible como propiedad de default export');
            }
          }

          console.log('\n6. Probando importación de @skyware/bot...');
          import('@skyware/bot').then((skywareBot) => {
            console.log('✅ @skyware/bot importado correctamente');
            console.log('  - Propiedades disponibles:', Object.keys(skywareBot));
            if (skywareBot.Bot) {
              console.log('  - Bot disponible');
            } else {
              console.log('  - Bot NO disponible directamente');
            }
            
            console.log('\nTodas las importaciones fueron exitosas');
          }).catch((error) => {
            console.error('❌ Error importando @skyware/bot:', error);
          });
        }).catch((error) => {
          console.error('❌ Error importando @atproto/api:', error);
        });
      }).catch((error) => {
        console.error('❌ Error importando https-proxy-agent:', error);
      });
    }).catch((error) => {
      console.error('❌ Error importando http-proxy-agent:', error);
    });
  }).catch((error) => {
    console.error('❌ Error importando dotenv:', error);
  });
} catch (error) {
  console.error('Error general en el script:', error);
}
