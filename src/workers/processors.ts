// src/workers/processors.ts
// Re-export processors from the modular structure
import { engagementBotProcessor } from './processors/engagementBotProcessor.ts';
import { massPostProcessor } from './processors/massPostProcessor.ts';

export {
  engagementBotProcessor,
  massPostProcessor
};

export default {
  engagementBotProcessor,
  massPostProcessor
};
