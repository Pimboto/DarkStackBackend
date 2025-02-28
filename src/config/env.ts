// src/config/env.ts
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Cargar variables de entorno desde .env con mejor manejo de errores
try {
  const envPath = path.resolve(process.cwd(), '.env');
  
  // Comprobar si el archivo existe antes de intentar cargarlo
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment variables from ${envPath}`);
    const result = dotenv.config({ path: envPath });
    
    if (result.error) {
      console.error('Error loading .env file:', result.error);
    } else {
      console.log('Environment variables loaded successfully');
    }
  } else {
    console.warn('.env file not found at path:', envPath);
    console.warn('Using environment variables from process.env only');
  }
} catch (error) {
  console.error('Unexpected error loading .env file:', error);
}

/**
 * Obtiene una variable de entorno con un valor por defecto opcional
 * @param key Nombre de la variable de entorno
 * @param defaultValue Valor por defecto si la variable no existe
 * @returns El valor de la variable de entorno o el valor por defecto
 */
export const getEnvVariable = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;
  
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not defined and no default value was provided`);
  }
  
  return value;
};

/**
 * Imprime las variables de entorno configuradas (con valores sensibles ocultos)
 */
export const logEnvironmentVariables = (): void => {
  const sensitiveKeys = ['PASSWORD', 'KEY', 'SECRET', 'TOKEN', 'JWT'];
  
  console.log('=== Environment Variables ===');
  Object.keys(process.env)
    .filter(key => !key.startsWith('npm_') && !key.startsWith('_'))
    .sort()
    .forEach(key => {
      // Ocultar valores sensibles
      const isSensitive = sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive));
      const value = isSensitive ? '******' : process.env[key];
      console.log(`${key}=${value}`);
    });
  console.log('=============================');
};

export default { 
  getEnvVariable,
  logEnvironmentVariables
};
