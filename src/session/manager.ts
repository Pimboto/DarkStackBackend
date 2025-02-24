// src/session/manager.ts
import { AtpSessionData, AtpSessionEvent, BskyAgent } from '@atproto/api';
import fs from 'fs/promises';
import path from 'path';
import { ProxyManager } from '../utils/proxy';
import { SessionData, ProxyConfig } from '../types';

export class SessionManager {
  private readonly agent: BskyAgent;
  private readonly proxyManager?: ProxyManager;
  private readonly sessionPath: string;

  constructor(
    private readonly service: string = 'https://bsky.social',
    proxyConfig?: ProxyConfig,
    sessionFilePath: string = 'session.json'
  ) {
    this.sessionPath = path.resolve(process.cwd(), sessionFilePath);
    
    if (proxyConfig) {
      this.proxyManager = new ProxyManager(proxyConfig);
      // Configurar el proxy de manera global
      const proxyAgent = this.proxyManager.getAgent();
      const originalFetch = global.fetch;
      // @ts-ignore
      global.fetch = function(url: string | URL | Request, init?: RequestInit) {
        if (typeof url === 'string') {
          // @ts-ignore
          return originalFetch(url, { ...init, agent: proxyAgent });
        }
        return originalFetch(url, init);
      };
    }

    this.agent = new BskyAgent({
      service: this.service,
      persistSession: (evt: AtpSessionEvent, sess?: AtpSessionData) => {
        if (sess) {
          this.saveSession({
            did: sess.did,
            handle: sess.handle,
            email: sess.email,
            accessJwt: sess.accessJwt,
            refreshJwt: sess.refreshJwt,
          });
        }
      },
    });
  }

  async login(identifier: string, password: string): Promise<SessionData> {
    try {
      const result = await this.agent.login({
        identifier,
        password
      });

      const session = {
        did: result.data.did,
        handle: result.data.handle,
        email: result.data.email,
        accessJwt: result.data.accessJwt,
        refreshJwt: result.data.refreshJwt,
      };

      await this.saveSession(session);
      return session;
    } catch (error: any) {
      console.error('Login error details:', error);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async resumeSession(): Promise<SessionData | null> {
    try {
      const session = await this.loadSession();
      if (session) {
        await this.agent.resumeSession({
          did: session.did,
          handle: session.handle,
          email: session.email,
          accessJwt: session.accessJwt,
          refreshJwt: session.refreshJwt,
        });
        return session;
      }
      return null;
    } catch (error) {
      console.error('Failed to resume session:', error);
      return null;
    }
  }

  private async saveSession(session: SessionData): Promise<void> {
    try {
      await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  private async loadSession(): Promise<SessionData | null> {
    try {
      const data = await fs.readFile(this.sessionPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  getAgent(): BskyAgent {
    return this.agent;
  }

  async createPost(text: string) {
    if (!this.agent.session?.did) {
      throw new Error('Not logged in');
    }

    return this.agent.post({
      text: text,
      createdAt: new Date().toISOString(),
    });
  }

  async follow(did: string) {
    if (!this.agent.session?.did) {
      throw new Error('Not logged in');
    }

    return this.agent.follow(did);
  }

  async like(uri: string, cid: string) {
    if (!this.agent.session?.did) {
      throw new Error('Not logged in');
    }

    return this.agent.like(uri, cid);
  }

  async getTimeline(limit: number = 50) {
    if (!this.agent.session?.did) {
      throw new Error('Not logged in');
    }
  
    return this.agent.getTimeline({ limit });
  }

  async replyToPost(replyTo: { uri: string; cid: string }, text: string) {
    if (!this.agent.session?.did) {
      throw new Error('Not logged in');
    }

    return this.agent.post({
      text: text,
      reply: {
        root: { uri: replyTo.uri, cid: replyTo.cid },
        parent: { uri: replyTo.uri, cid: replyTo.cid }
      }
    });
  }

  async repost(uri: string, cid: string) {
    if (!this.agent.session?.did) {
      throw new Error('Not logged in');
    }

    return this.agent.repost(uri, cid);
  }

  async checkProxy(): Promise<{ proxyString: string; currentIp: string }> {
    try {
      const proxyString = this.proxyManager 
        ? `${this.proxyManager.getProxyString()}`
        : 'No proxy configured';

      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      
      return {
        proxyString,
        currentIp: data.ip
      };
    } catch (error) {
      console.error('Error checking proxy:', error);
      return {
        proxyString: 'Error getting proxy info',
        currentIp: 'Error getting IP'
      };
    }
  }
}
