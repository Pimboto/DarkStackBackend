// src/utils/random.ts

/**
 * Genera un número entero aleatorio entre min y max (inclusivos)
 * @param min Valor mínimo
 * @param max Valor máximo
 * @returns Número entero aleatorio
 */
export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Genera un número decimal aleatorio entre min y max
 * @param min Valor mínimo
 * @param max Valor máximo
 * @param decimals Número de decimales (por defecto 2)
 * @returns Número decimal aleatorio
 */
export function getRandomFloat(min: number, max: number, decimals: number = 2): number {
  const random = Math.random() * (max - min) + min;
  const factor = Math.pow(10, decimals);
  return Math.round(random * factor) / factor;
}

/**
 * Selecciona un elemento aleatorio de un array
 * @param array Array de elementos
 * @returns Elemento aleatorio del array
 */
export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Selecciona múltiples elementos aleatorios de un array
 * @param array Array de elementos
 * @param count Número de elementos a seleccionar
 * @param allowDuplicates Si es true, permite seleccionar el mismo elemento más de una vez
 * @returns Array con los elementos seleccionados
 */
export function getRandomElements<T>(array: T[], count: number, allowDuplicates: boolean = false): T[] {
  if (count <= 0) return [];
  
  if (allowDuplicates) {
    // Con duplicados, simplemente seleccionamos count veces
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(getRandomElement(array));
    }
    return result;
  } else {
    // Sin duplicados, necesitamos clonar y mezclar el array
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    // Devolvemos como máximo el número de elementos disponibles
    return shuffled.slice(0, Math.min(count, array.length));
  }
}

/**
 * Mezcla un array de forma aleatoria (algoritmo Fisher-Yates)
 * @param array Array a mezclar
 * @returns Array mezclado (modifica el original)
 */
export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Devuelve true o false con una probabilidad dada
 * @param probability Probabilidad de devolver true (0-1)
 * @returns Resultado booleano aleatorio
 */
export function randomBoolean(probability: number = 0.5): boolean {
  return Math.random() < probability;
}

export default {
  getRandomInt,
  getRandomFloat,
  getRandomElement,
  getRandomElements,
  shuffleArray,
  randomBoolean
};
