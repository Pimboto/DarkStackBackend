// src/types/bullmq.d.ts
import 'bullmq';

declare module 'bullmq' {
  interface Job<DataType = any, ReturnType = any, NameType extends string = string> {
    getLogs(): Promise<{ logs: string[] }>;
  }
}
