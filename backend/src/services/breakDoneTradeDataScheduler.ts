import BreakDoneTradeCalculator from '../calculations/done/break_done_trade';
import { SchedulerLogService } from './schedulerLogService';

export class BreakDoneTradeDataScheduler {
  private calculator: BreakDoneTradeCalculator;

  constructor() {
    this.calculator = new BreakDoneTradeCalculator();
  }

  /**
   * Generate break done trade data
   */
  async generateBreakDoneTradeData(dateSuffix?: string, logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'break_done_trade',
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
      console.log(`🔄 Starting Break Done Trade calculation...`);
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Break Done Trade calculation...'
        });
      }
      
      const result = await this.calculator.generateBreakDoneTradeData(dateSuffix);
      
      if (result.success) {
        console.log('✅ Break Done Trade calculation completed successfully');
        if (finalLogId) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: 1,
            files_created: 1,
            files_failed: 0
          });
        }
      } else {
        console.error('❌ Break Done Trade calculation failed:', result.message);
        if (finalLogId) {
          await SchedulerLogService.markFailed(finalLogId, result.message);
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Break Done Trade calculation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (finalLogId) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate break done trade data: ${errorMessage}`
      };
    }
  }


  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Break Done Trade service is ready to generate data'
    };
  }
}

export default BreakDoneTradeDataScheduler;
