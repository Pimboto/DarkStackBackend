// src/types.ts
import { AppBskyFeedDefs } from '@atproto/api';

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
  feed: AppBskyFeedDefs.FeedViewPost[];
}
