// src/types/atproto.d.ts
declare module '@atproto/api' {
  export class BskyAgent {
    constructor(config: { service: string });
    
    login(credentials: { 
      identifier: string; 
      password: string 
    }): Promise<{
      data: {
        did: string;
        handle: string;
        email?: string;
        accessJwt: string;
        refreshJwt: string;
      }
    }>;
    
    post(post: { 
      text: string; 
      createdAt?: string;
      reply?: {
        root: { uri: string; cid: string };
        parent: { uri: string; cid: string };
      }
    }): Promise<{ uri: string }>;
    
    getTimeline(options: { 
      limit?: number 
    }): Promise<{
      data: {
        feed: Array<{
          post: {
            author: { handle: string };
            record: { text: string };
            indexedAt: string;
          }
        }>
      }
    }>;
    
    resumeSession(session: any): Promise<void>;
    like(uri: string, cid: string): Promise<any>;
    repost(uri: string, cid: string): Promise<any>;
    follow(did: string): Promise<any>;
    
    session?: {
      did?: string;
    };
  }

  const agent: {
    default: any;
    BskyAgent: typeof BskyAgent;
  };

  export default agent;
}
