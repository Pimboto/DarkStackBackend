// src/workers/processors/engagementBotProcessor.ts
import { Job } from 'bullmq';
import { initializeBsky, LogLevel } from '../../index.ts';
import { createEngagementStrategy } from '../../strategies/engagementStrategy.ts';
import { BaseProcessor } from './BaseProcessor.ts';
import { PlannedAction, EngagementResult } from '../../types/index.ts';
import logger from '../../utils/logger.ts';

/**
 * Processor for engagement bot jobs
 * Handles automated engagement with timeline posts
 */
export class EngagementBotProcessor extends BaseProcessor {
  /**
   * Process an engagement bot job
   * @param job BullMQ job
   * @returns Processing result
   */
  async process(job: Job): Promise<any> {
    logger.info(`Processing engagementBot job ${job.id}`);
    await job.updateProgress(10);

    try {
      const { 
        sessionData, 
        engagementOptions = {}, 
        strategyType = 'human-like',
        accountMetadata
      } = job.data;
      
      if (!sessionData) {
        throw new Error('No session data provided in job');
      }

      logger.info(`Processing engagement for account: ${sessionData.handle}`);
      
      // Handle authentication
      const { atpClient } = await this.handleAuthentication(sessionData, accountMetadata);
      
      await job.updateProgress(30);

      // Check proxy status
      const proxyInfo = await this.checkProxy(atpClient);

      // Initialize services
      const { engagementService } = await initializeBsky({
        logLevel: LogLevel.DEBUG,
        autoLogin: false,
      });

      logger.info(`Creating ${strategyType} engagement strategy...`);
      const strategy = createEngagementStrategy(
        strategyType as 'random' | 'human-like',
        engagementOptions
      );

      await job.updateProgress(40);
      logger.info('Simulating engagement actions...');
      
      // Create job-specific logger
      const jobLogger = this.createJobLogger(job);
      
      // Create a new instance of EngagementService with the custom logger
      const customEngagementService = new (engagementService.constructor as any)(
        atpClient,
        jobLogger
      );
      
      const simulationResult = strategy.simulate();

      await job.updateProgress(50);
      const timelineResponse = await atpClient.getTimeline(
        Math.max(100, simulationResult.plannedActions.length * 2)
      );

      let processedActions = 0;
      const totalActions = simulationResult.plannedActions.length;

      // Helper for reporting progress
      const reportActionProgress = async () => {
        processedActions++;
        const percentage = 50 + Math.floor((processedActions / totalActions) * 50);
        await job.updateProgress(percentage);
      };

      logger.info('Executing engagement actions...');
      const results = await customEngagementService.executeEngagement(
        simulationResult,
        {
          timelinePosts: timelineResponse.feed,
          stopOnError: false,
          dryRun: false,
          progressCallback: async (action: PlannedAction, index: number) => {
            await job.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Executing ${action.type} action #${index+1}`
            }));
            await reportActionProgress();
          }
        }
      );
      await job.updateProgress(100);

      const successCount = results.filter((r: EngagementResult) => r.success).length;
      const likeCount = results.filter((r: EngagementResult) => r.success && r.action === 'like').length;
      const repostCount = results.filter((r: EngagementResult) => r.success && r.action === 'repost').length;
      const errorCount = results.filter((r: EngagementResult) => !r.success).length;

      return {
        success: true,
        message: 'Engagement bot job completed',
        account: accountMetadata ? {
          id: accountMetadata.accountId,
          username: sessionData.handle
        } : undefined,
        stats: {
          totalActions,
          successCount,
          likeCount,
          repostCount,
          errorCount,
        },
        proxy: proxyInfo,
      };
    } catch (err) {
      logger.error(`Error in engagementBot job ${job.id}:`, err);
      throw err;
    }
  }
}

/**
 * Process an engagement bot job
 */
export async function engagementBotProcessor(job: Job): Promise<any> {
  const processor = new EngagementBotProcessor();
  return processor.process(job);
}
