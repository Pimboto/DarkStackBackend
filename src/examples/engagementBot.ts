// src/examples/engagementBot.ts
import { initializeBsky, LogLevel } from '../index.js';
import { createEngagementStrategy } from '../strategies/engagementStrategy.js';
import logger from '../utils/logger.js';

/**
 * Ejemplo de bot que simula engagement (likes y reposts)
 */
async function main() {
  try {
    // Configurar el logger para mayor detalle
    logger.setLevel(LogLevel.DEBUG);
    logger.info('Starting engagement bot example...');
    
    // Inicializar el sistema completo
    const { engagementService, atpClient } = await initializeBsky({
      autoLogin: true,
      enableChat: false
    });
    
    // Verificar el proxy
    const proxyInfo = await atpClient.checkProxy();
    logger.info(`Current proxy: ${proxyInfo.proxyString}`);
    logger.info(`Current IP: ${proxyInfo.currentIp}`);
    
    // Opciones de engagement
    const engagementOptions = {
      numberOfActions: 20,       // Número total de acciones
      delayRange: [10, 30] as [number, number],      // Retraso entre acciones (segundos)
      skipRange: [0, 3] as [number, number],         // Posts a saltar
      likePercentage: 70         // Porcentaje de likes (vs reposts)
    };
    
    // Crear estrategia de engagement
    logger.info('Creating engagement strategy...');
    const strategy = createEngagementStrategy('human-like', engagementOptions);
    
    // Simular plan de engagement
    logger.info('Simulating engagement actions...');
    const simulationResult = strategy.simulate();
    
    // Mostrar resultados de la simulación
    logger.info(`Simulation complete: ${simulationResult.plannedActions.length} actions planned`);
    logger.info(`Total time: ${Math.round(simulationResult.totalTime / 60)} minutes`);
    logger.info(`Actions: ${simulationResult.likeCount} likes, ${simulationResult.repostCount} reposts`);
    
    // Pedir confirmación para ejecutar
    logger.info('Ready to execute engagement plan');
    
    // En una aplicación real, aquí se añadiría una confirmación del usuario
    // o un método para continuar con la ejecución
    const shouldExecute = true; // Esto vendría de la entrada del usuario
    
    if (shouldExecute) {
      // Obtener timeline
      logger.info('Getting timeline...');
      const timelineResponse = await atpClient.getTimeline(50);
      const timelinePosts = timelineResponse.feed;
      
      logger.info(`Retrieved ${timelinePosts.length} posts from timeline`);
      
      // Ejecutar acciones
      logger.info('Executing engagement actions...');
      const results = await engagementService.executeEngagement(simulationResult, {
        timelinePosts,
        stopOnError: false,
        dryRun: false // Cambiar a true para simular sin ejecutar realmente
      });
      
      // Mostrar resultados
      const successCount = results.filter(r => r.success).length;
      logger.info(`Engagement execution complete. Success: ${successCount}/${simulationResult.plannedActions.length}`);
      
      // Mostrar detalles de los éxitos y errores
      const likeCount = results.filter(r => r.success && r.action === 'like').length;
      const repostCount = results.filter(r => r.success && r.action === 'repost').length;
      const errorCount = results.filter(r => !r.success).length;
      
      logger.info(`Successful actions: ${likeCount} likes, ${repostCount} reposts`);
      
      if (errorCount > 0) {
        logger.warn(`Failed actions: ${errorCount}`);
        results.filter(r => !r.success).forEach((result, index) => {
          logger.error(`Error ${index + 1}: ${result.error?.message || 'Unknown error'}`);
        });
      }
    } else {
      logger.info('Execution cancelled');
    }
    
    logger.info('Engagement bot example completed');
    
  } catch (error) {
    logger.error('Error running engagement bot example:', error);
    process.exit(1);
  }
}

// Ejecutar el ejemplo
if (import.meta.url.startsWith('file:')) {
  const scriptPath = process.argv[1] ? new URL(process.argv[1], 'file://').pathname : '';
  const currentPath = import.meta.url.replace('file://', '');
  
  if (currentPath === scriptPath || process.argv[1] === undefined) {
    main().catch(console.error);
  }
}

export default main;
