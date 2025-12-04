import BrokerTransactionCalculator from '../calculations/broker/broker_transaction';
import { SchedulerLogService } from './schedulerLogService';

export class BrokerTransactionDataScheduler {
  private calculator: BrokerTransactionCalculator;

  constructor() {
    this.calculator = new BrokerTransactionCalculator();
  }

  /**
   * Generate broker transaction data
   */
  async generateBrokerTransactionData(dateSuffix?: string, logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_transaction',
        trigger_type: triggeredBy && !triggeredBy.startsWith('Phase') && !triggeredBy.startsWith('phase') ? 'manual' : 'scheduled',
        triggered_by: triggeredBy || 'Phase 5 Broktrans Broker',
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
      console.log(`🔄 Starting Broker Transaction calculation for: ${targetDate}`);
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: `Starting Broker Transaction calculation for ${targetDate}...`
        });
      }
      
      const result = await this.calculator.generateBrokerTransactionData(targetDate, finalLogId);
      
      // Check if this is called from a Phase (don't mark completed/failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
      
      if (result.success) {
        console.log('✅ Broker Transaction calculation completed successfully');
        if (finalLogId && !isFromPhase) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: 1,
            files_created: 1,
            files_failed: 0
          });
        }
      } else {
        console.error('❌ Broker Transaction calculation failed:', result.message);
        if (finalLogId && !isFromPhase) {
          await SchedulerLogService.markFailed(finalLogId, result.message);
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Transaction calculation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
      if (finalLogId && !isFromPhase) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate broker transaction data: ${errorMessage}`
      };
    }
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Transaction service is ready to generate data'
    };
  }
}

export default BrokerTransactionDataScheduler;

