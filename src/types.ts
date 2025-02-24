// src/types.ts
// Eliminamos la importación específica para evitar problemas de compatibilidad
// import { AppBskyFeedDefs } from '@atproto/api';

export interface SessionData {
  did: string;
  handle: string;
  email?: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: 'http' | 'https';
}

export interface TimelineResponse {
  cursor?: string;
  feed: any[]; // Cambiado de AppBskyFeedDefs.FeedViewPost[] a any[]
}

// Additional types for Skyware bot integration
export interface SkywareProxyBotInterface {
  initialize(): Promise<any>;
  login(identifier: string, password: string): Promise<any>;
  post(text: string): Promise<any>;
  setChatPreference(preference: any): Promise<void>;
  onMessage(callback: (message: any) => Promise<void>): void;
  onReply(callback: (reply: any) => Promise<void>): void;
  onMention(callback: (mention: any) => Promise<void>): void;
  onFollow(callback: (follow: any) => Promise<void>): void;
  getConversationForMembers(didOrHandles: string[]): Promise<any>;
  listConversations(options?: { cursor?: string }): Promise<any>;
  checkProxy(): Promise<{ proxyString: string; currentIp: string }>;
  shutdown(): void;
}

export interface ConversationInterface {
  getMessages(cursor?: string): Promise<{ cursor?: string; messages: any[] }>;
  sendMessage(message: { text: string | any }): Promise<void>;
}

export interface ChatMessageInterface {
  text: string;
  getSender(): Promise<any>;
  getConversation(): Promise<ConversationInterface | null>;
}
