// src/config/supabase.ts
import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.ts';

const SUPABASE_URL = "https://rnsmktmwysnutffrfeai.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc21rdG13eXNudXRmZnJmZWFpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTA1NjYxMSwiZXhwIjoyMDUwNjMyNjExfQ.bL9XTYli0CzKC-J1_e_vQzRNi1FgNEAz0TjDmyfUFfc";

// Crear cliente de Supabase con clave de servicio
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Interfaz para los datos de cuenta recuperados
 */
export interface AccountData {
  id: number;
  username: string;
  password: string;
  jwt: string | null; // accessJwt
  refresh_jwt: string | null; // refreshJwt
  proxy: string | null;
  user_agent: string | null;
  endpoint: string | null;
}

/**
 * Obtiene todas las cuentas de una categoría específica
 * @param categoryId ID de la categoría
 * @returns Lista de cuentas en la categoría
 */
export async function getAccountsByCategory(categoryId: number): Promise<AccountData[]> {
  try {
    logger.info(`Getting accounts for category ID: ${categoryId}`);
    
    const { data, error } = await supabase
      .from('accounts_imported')
      .select('id, username, password, jwt, refresh_jwt, proxy, user_agent, endpoint')
      .eq('category_id', categoryId)
      .eq('status', 'alive');
    
    if (error) {
      logger.error('Error fetching accounts:', error);
      throw new Error(`Failed to fetch accounts: ${error.message}`);
    }
    
    logger.info(`Found ${data?.length || 0} accounts in category ${categoryId}`);
    return data || [];
  } catch (error) {
    logger.error('Exception in getAccountsByCategory:', error);
    throw error;
  }
}

/**
 * Actualiza los tokens JWT de una cuenta
 * @param accountId ID de la cuenta
 * @param accessJwt Nuevo token de acceso
 * @param refreshJwt Nuevo token de refresco
 */
export async function updateAccountTokens(
  accountId: number,
  accessJwt: string,
  refreshJwt: string
): Promise<void> {
  try {
    logger.info(`Updating tokens for account ID: ${accountId}`);
    
    const { error } = await supabase
      .from('accounts_imported')
      .update({
        jwt: accessJwt,
        refresh_jwt: refreshJwt,
        updated_at: new Date().toISOString()
      })
      .eq('id', accountId);
    
    if (error) {
      logger.error('Error updating account tokens:', error);
      throw new Error(`Failed to update account tokens: ${error.message}`);
    }
    
    logger.info(`Successfully updated tokens for account ID: ${accountId}`);
  } catch (error) {
    logger.error('Exception in updateAccountTokens:', error);
    throw error;
  }
}

export default {
  supabase,
  getAccountsByCategory,
  updateAccountTokens
};
