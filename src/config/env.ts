// src/config/env.ts
import dotenv from 'dotenv';

// Cargar variables de entorno desde .env
dotenv.config();

/**
 * Obtiene una variable de entorno con un valor por defecto opcional
 * @param key Nombre de la variable de entorno
 * @param defaultValue Valor por defecto si la variable no existe
 * @returns El valor de la variable de entorno o el valor por defecto
 */
export const getEnvVariable = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not defined and no default value was provided`);
  }
  
  return value;
};

export default { getEnvVariable };
