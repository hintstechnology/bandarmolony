import AccumulationDistributionCalculator from '../calculations/accumulation/accumulation_distribution';
import { SchedulerLogService } from './schedulerLogService';

export class AccumulationDataScheduler {
  private calculator: AccumulationDistributionCalculator;

  constructor() {
    this.calculator = new AccumulationDistributionCalculator();
  }

  /**
   * Generate accumulation distribution data for specific date or all dates
   */
  async generateAccumulationData(dateSuffix?: string, logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'accumulation_distribution',
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
      console.log(`🔄 Starting Accumulation Distribution calculation for: ${targetDate}`);
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: `Starting Accumulation Distribution calculation for ${targetDate}...`
        });
      }
      
      // Accumulation distribution calculator processes specific date or all dates
      const result = await this.calculator.generateAccumulationDistributionData(targetDate, finalLogId);
      
      if (result.success) {
        console.log('✅ Accumulation Distribution calculation completed successfully');
        if (finalLogId) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: 1,
            files_created: 1,
            files_failed: 0
          });
        }
      } else {
        console.error('❌ Accumulation Distribution calculation failed:', result.message);
        if (finalLogId) {
          await SchedulerLogService.markFailed(finalLogId, result.message);
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Accumulation Distribution calculation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (finalLogId) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate accumulation distribution data: ${errorMessage}`
      };
    }
  }


  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Accumulation Distribution service is ready to generate data'
    };
  }
}

export default AccumulationDataScheduler;

