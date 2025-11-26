import ForeignFlowCalculator from '../calculations/foreign/foreign_flow';
import { SchedulerLogService } from './schedulerLogService';

export class ForeignFlowDataScheduler {
  private calculator: ForeignFlowCalculator;

  constructor() {
    this.calculator = new ForeignFlowCalculator();
  }

  /**
   * Generate foreign flow data
   */
  async generateForeignFlowData(dateSuffix?: string, logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'foreign_flow',
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
      const targetDate = dateSuffix || this.getCurrentDateSuffix();
      console.log(`🔄 Starting Foreign Flow calculation for date: ${targetDate}`);
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: `Starting Foreign Flow calculation for ${targetDate}...`
        });
      }
      
      const result = await this.calculator.generateForeignFlowData(targetDate);
      
      if (result.success) {
        console.log('✅ Foreign Flow calculation completed successfully');
        if (finalLogId) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: 1,
            files_created: 1,
            files_failed: 0
          });
        }
      } else {
        console.error('❌ Foreign Flow calculation failed:', result.message);
        if (finalLogId) {
          await SchedulerLogService.markFailed(finalLogId, result.message);
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Foreign Flow calculation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (finalLogId) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate foreign flow data: ${errorMessage}`
      };
    }
  }

  /**
   * Get current date suffix in YYMMDD format
   */
  private getCurrentDateSuffix(): string {
    const today = new Date();
    return today.toISOString().slice(2, 10).replace(/-/g, '');
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Foreign Flow service is ready to generate data'
    };
  }
}

export default ForeignFlowDataScheduler;

