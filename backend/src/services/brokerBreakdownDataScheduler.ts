import BrokerBreakdownCalculator from '../calculations/broker/broker_breakdown';
import { SchedulerLogService } from './schedulerLogService';

export class BrokerBreakdownDataScheduler {
  private calculator: BrokerBreakdownCalculator;

  constructor() {
    this.calculator = new BrokerBreakdownCalculator();
  }

  /**
   * Generate broker breakdown data for specific date or all files
   */
  async generateBrokerBreakdownData(dateSuffix?: string, logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_breakdown',
        trigger_type: triggeredBy ? 'manual' : 'scheduled',
        triggered_by: triggeredBy || 'system',
        status: 'running',
        environment: process.env['NODE_ENV'] || 'development'
      });

      if (!logEntry) {
        console.error('❌ Failed to create scheduler log entry');
        return {
          success: false,
          message: 'Failed to create scheduler log entry'
        };
      }

      finalLogId = logEntry.id!;
    }

    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Breakdown calculation for: ${targetDate}`);
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: `Starting Broker Breakdown calculation for ${targetDate}...`
        });
      }
      
      // Broker breakdown calculator processes specific date or all files
      const result = await this.calculator.generateBrokerBreakdownData(targetDate, finalLogId);
      
      if (result.success) {
        console.log('✅ Broker Breakdown calculation completed successfully');
        if (finalLogId) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: 1,
            files_created: 1,
            files_failed: 0
          });
        }
      } else {
        console.error('❌ Broker Breakdown calculation failed:', result.message);
        if (finalLogId) {
          await SchedulerLogService.markFailed(finalLogId, result.message);
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Breakdown calculation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (finalLogId) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate broker breakdown data: ${errorMessage}`
      };
    }
  }
}

export default BrokerBreakdownDataScheduler;
