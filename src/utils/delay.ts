// src/utils/delay.ts
import { getRandomInt } from './random.js';
import logger from './logger.js';

/**
 * Espera un número específico de milisegundos
 * @param ms Milisegundos a esperar
 * @returns Promise que se resuelve después del tiempo especificado
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Espera un número específico de segundos
 * @param seconds Segundos a esperar
 * @returns Promise que se resuelve después del tiempo especificado
 */
export function sleepSeconds(seconds: number): Promise<void> {
  return sleep(seconds * 1000);
}

/**
 * Espera un tiempo aleatorio entre min y max milisegundos
 * @param min Tiempo mínimo en milisegundos
 * @param max Tiempo máximo en milisegundos
 * @returns Promise que se resuelve después del tiempo aleatorio
 */
export async function randomSleep(min: number, max: number): Promise<void> {
  const delay = getRandomInt(min, max);
  logger.debug(`Random sleep for ${delay}ms`);
  return sleep(delay);
}

/**
 * Espera un tiempo aleatorio entre min y max segundos
 * @param min Tiempo mínimo en segundos
 * @param max Tiempo máximo en segundos
 * @returns Promise que se resuelve después del tiempo aleatorio
 */
export async function randomSleepSeconds(min: number, max: number): Promise<void> {
  const delay = getRandomInt(min, max);
  logger.debug(`Random sleep for ${delay}s`);
  return sleepSeconds(delay);
}

/**
 * Ejecuta una función con reintento en caso de fallo
 * @param fn Función a ejecutar (debe devolver una promesa)
 * @param retries Número máximo de reintentos
 * @param delay Tiempo a esperar entre reintentos (ms)
 * @param backoff Factor de incremento del tiempo de espera
 * @returns Resultado de la función
 */
export async function retry<T>(
  fn: () => Promise<T>, 
  retries: number = 3,
  delay: number = 1000,
  backoff: number = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    
    logger.debug(`Retrying after ${delay}ms, ${retries} retries left`);
    await sleep(delay);
    
    return retry(fn, retries - 1, delay * backoff, backoff);
  }
}

export default {
  sleep,
  sleepSeconds,
  randomSleep,
  randomSleepSeconds,
  retry
};
