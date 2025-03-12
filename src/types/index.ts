// src/types/index.ts

// Configuración del proxy
export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: 'http' | 'https';
}

// Datos de sesión 
export interface SessionData {
  did: string;
  handle: string;
  email?: string;
  accessJwt: string;
  refreshJwt: string;
}

// Información del proxy
export interface ProxyInfo {
  proxyString: string;
  currentIp: string;
}

// Configuración de engagement
export interface EngagementOptions {
  numberOfActions: number;
  delayRange: [number, number]; // [min, max] en segundos
  skipRange: [number, number];  // [min, max] posts a saltar
  likePercentage: number;       // porcentaje de likes (el resto serán reposts)
}

// Tipo de acción
export type ActionType = 'like' | 'repost';

// Definición de una acción planificada
export interface PlannedAction {
  type: ActionType;
  delay: number;
  skip: number;
  index: number;
  executed?: boolean;
}

// Resultado de simulación
export interface SimulationResult {
  plannedActions: PlannedAction[];
  totalTime: number;
  likeCount: number;
  repostCount: number;
}

// Resultado de una acción de engagement
export interface EngagementResult {
  success: boolean;
  action: ActionType;
  postUri?: string;
  postCid?: string;
  error?: Error;
}

// Tipos de feed disponibles
export enum FeedType {
  TIMELINE = 'timeline',
  WHATS_HOT = 'whats-hot'
}

// Tipos de post en el timeline
export interface TimelinePost {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
  };
  text: string;
  createdAt: string;
  indexedAt: string;
}

// Definición de cliente Skyware
export interface SkywareBot {
  login(credentials: { identifier: string; password: string }): Promise<any>;
  post(options: { text: string }): Promise<any>;
  setChatPreference(preference: any): Promise<void>;
  on(eventName: string, callback: any): void;
  getConversationForMembers(didOrHandles: string[]): Promise<any>;
  listConversations(options?: { cursor?: string }): Promise<any>;
  removeAllListeners(): void;
  profile: any;
}

// Niveles de log
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}
