// src/config/config.ts
import { ProxyConfig } from '../types/index.ts';
import { getEnvVariable } from './env.ts';

export const DEFAULT_SERVICE_URL = 'https://bsky.social';
export const DEFAULT_SESSION_FILE_PATH = 'session.json';
export const DEFAULT_POLLING_INTERVAL = 5; // seconds

export const getProxyConfig = (): ProxyConfig => {
  return {
    host: getEnvVariable('PROXY_HOST', 'ultra.marsproxies.com'),
    port: parseInt(getEnvVariable('PROXY_PORT', '44443')),
    username: getEnvVariable('PROXY_USERNAME', 'mr45604xmD3'),
    password: getEnvVariable('PROXY_PASSWORD', 'M3AYECLDDO_country-us_session-qrn7anm9_lifetime-168h_ultraset-1'),
    protocol: getEnvVariable('PROXY_PROTOCOL', 'http') as 'http' | 'https'
  };
};

export const getBskyCredentials = () => {
  const username = getEnvVariable('BSKY_USERNAME');
  const password = getEnvVariable('BSKY_PASSWORD');
  
  if (!username || !password) {
    throw new Error('BSKY_USERNAME and BSKY_PASSWORD environment variables are required');
  }
  
  return { username, password };
};

export const getEngagementConfig = () => {
  return {
    defaultDelayRange: [5, 30], // seconds between actions
    defaultSkipRange: [0, 4],   // number of posts to skip
    defaultLikePercentage: 70,  // percentage of likes vs reposts
  };
};

export default {
  getProxyConfig,
  getBskyCredentials,
  getEngagementConfig,
  DEFAULT_SERVICE_URL,
  DEFAULT_SESSION_FILE_PATH,
  DEFAULT_POLLING_INTERVAL
};
