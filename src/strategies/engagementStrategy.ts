// src/strategies/engagementStrategy.ts
import { EngagementOptions, SimulationResult, PlannedAction } from '../types/index.ts';
import { getRandomInt } from '../utils/random.ts';
import { getEngagementConfig } from '../config/config.ts';

/**
 * Estrategia base para simular engagement
 */
abstract class EngagementStrategy {
  /**
   * Crea una instancia de la estrategia de engagement
   * @param options Opciones de configuración
   */
  constructor(protected options: Partial<EngagementOptions> = {}) {
    // Aplicar valores por defecto
    const config = getEngagementConfig();
    this.options = {
      numberOfActions: 10,
      delayRange: config.defaultDelayRange as [number, number],
      skipRange: config.defaultSkipRange as [number, number],
      likePercentage: config.defaultLikePercentage,
      ...options
    };
  }

  /**
   * Genera un plan de acciones de engagement
   * @returns Resultado de la simulación
   */
  abstract simulate(): SimulationResult;
}

/**
 * Estrategia de engagement aleatorio básica
 */
export class RandomEngagementStrategy extends EngagementStrategy {
  /**
   * Genera un plan aleatorio de acciones de engagement
   * @returns Resultado de la simulación
   */
  simulate(): SimulationResult {
    const { 
      numberOfActions = 10,
      delayRange = [5, 30] as [number, number],
      skipRange = [0, 4] as [number, number],
      likePercentage = 70
    } = this.options as EngagementOptions;
    
    // Calcular número de likes y reposts
    const likeCount = Math.floor(numberOfActions * (likePercentage / 100));
    const repostCount = numberOfActions - likeCount;
    
    // Generar acciones planificadas
    const plannedActions: PlannedAction[] = [];
    let totalTime = 0;
    
    for (let i = 0; i < numberOfActions; i++) {
      // Determinar tipo de acción
      const type = i < likeCount ? 'like' : 'repost';
      
      // Generar delay y skip aleatorios
      const delay = getRandomInt(delayRange[0], delayRange[1]);
      const skip = getRandomInt(skipRange[0], skipRange[1]);
      
      plannedActions.push({
        type,
        delay,
        skip,
        index: i
      });
      
      totalTime += delay;
    }
    
    return {
      plannedActions,
      totalTime,
      likeCount,
      repostCount
    };
  }
}

/**
 * Estrategia de engagement que intenta simular un patrón humano realista
 */
export class HumanLikeEngagementStrategy extends EngagementStrategy {
  /**
   * Genera un plan de acciones de engagement que simula comportamiento humano
   * @returns Resultado de la simulación
   */
  simulate(): SimulationResult {
    const { 
      numberOfActions = 10,
      delayRange = [5, 30] as [number, number],
      skipRange = [0, 4] as [number, number],
      likePercentage = 70
    } = this.options as EngagementOptions;
    
    // Calcular número de likes y reposts
    const likeCount = Math.floor(numberOfActions * (likePercentage / 100));
    const repostCount = numberOfActions - likeCount;
    
    // Generar acciones planificadas
    const plannedActions: PlannedAction[] = [];
    let totalTime = 0;
    
    // En un patrón humano, a veces hay clusters de actividad
    // y tiempos más largos de inactividad
    
    // Generar un número de sesiones (clusters)
    const numberOfSessions = Math.max(1, Math.floor(numberOfActions / 5));
    const actionsPerSession = Array(numberOfSessions).fill(0);
    
    // Distribuir las acciones entre las sesiones
    let remainingActions = numberOfActions;
    for (let i = 0; i < numberOfSessions - 1; i++) {
      // Cada sesión tiene al menos una acción y como máximo la mitad de las restantes
      const sessionActions = Math.min(
        remainingActions - (numberOfSessions - i - 1),
        Math.max(1, Math.floor(Math.random() * remainingActions / 2))
      );
      actionsPerSession[i] = sessionActions;
      remainingActions -= sessionActions;
    }
    actionsPerSession[numberOfSessions - 1] = remainingActions;
    
    // Ahora, generar acciones para cada sesión
    let actionIndex = 0;
    let likeRemaining = likeCount;
    
    for (let sessionIdx = 0; sessionIdx < numberOfSessions; sessionIdx++) {
      const sessionActionCount = actionsPerSession[sessionIdx];
      const sessionLikes = Math.min(
        likeRemaining,
        Math.round(sessionActionCount * (likePercentage / 100))
      );
      likeRemaining -= sessionLikes;
      
      // En una sesión, los delays son más cortos entre acciones
      const sessionDelayRange: [number, number] = [
        Math.max(1, Math.floor(delayRange[0] / 2)),
        Math.max(2, Math.floor(delayRange[1] / 3))
      ];
      
      // Para la primera acción de cada sesión (excepto la primera), añadir un delay largo
      if (sessionIdx > 0) {
        const longDelay = getRandomInt(
          delayRange[1], 
          delayRange[1] * 3
        );
        totalTime += longDelay;
      }
      
      // Generar acciones para esta sesión
      for (let i = 0; i < sessionActionCount; i++) {
        // Determinar tipo de acción
        const type = i < sessionLikes ? 'like' : 'repost';
        
        // Generar delay y skip aleatorios
        const delay = getRandomInt(sessionDelayRange[0], sessionDelayRange[1]);
        // Humanos tienden a interactuar más con los primeros posts que ven
        const skipBias = i === 0 ? 0.5 : 1; // Menor probabilidad de skip para la primera acción
        const skip = Math.floor(getRandomInt(0, Math.floor(skipRange[1] * skipBias)));
        
        plannedActions.push({
          type,
          delay,
          skip,
          index: actionIndex++
        });
        
        totalTime += delay;
      }
    }
    
    return {
      plannedActions,
      totalTime,
      likeCount,
      repostCount
    };
  }
}

/**
 * Crea una estrategia de engagement basada en el tipo especificado
 * @param type Tipo de estrategia a crear
 * @param options Opciones de configuración
 * @returns Estrategia de engagement
 */
export function createEngagementStrategy(
  type: 'random' | 'human-like' = 'random',
  options: Partial<EngagementOptions> = {}
): EngagementStrategy {
  switch (type) {
    case 'human-like':
      return new HumanLikeEngagementStrategy(options);
    case 'random':
    default:
      return new RandomEngagementStrategy(options);
  }
}

export default {
  RandomEngagementStrategy,
  HumanLikeEngagementStrategy,
  createEngagementStrategy
};
