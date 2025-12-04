import BrokerTransactionRGTNNGCalculator from '../calculations/broker/broker_transaction_rg_tn_ng';
import { SchedulerLogService } from './schedulerLogService';

export class BrokerTransactionRGTNNGDataScheduler {
  private calculator: BrokerTransactionRGTNNGCalculator;

  constructor() {
    this.calculator = new BrokerTransactionRGTNNGCalculator();
  }

  async generateBrokerTransactionRGTNNGData(dateSuffix?: string, logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_transaction_rgtnng',
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
      console.log(`🔄 Starting Broker Transaction RG/TN/NG calculation...`);
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Broker Transaction RG/TN/NG calculation...'
        });
      }
      
      const result = await this.calculator.generateBrokerTransactionData(dateSuffix, finalLogId);
      
      // Check if this is called from a Phase (don't mark completed/failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
      
      if (result.success) {
        console.log('✅ Broker Transaction RG/TN/NG calculation completed successfully');
        if (finalLogId && !isFromPhase) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: 1,
            files_created: 1,
            files_failed: 0
          });
        }
      } else {
        console.error('❌ Broker Transaction RG/TN/NG calculation failed:', result.message);
        if (finalLogId && !isFromPhase) {
          await SchedulerLogService.markFailed(finalLogId, result.message);
        }
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error during Broker Transaction RG/TN/NG calculation:', errorMessage);
      // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
      if (finalLogId && !isFromPhase) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate broker transaction RG/TN/NG data: ${errorMessage}`
      };
    }
  }

  async generateBrokerTransactionRGTNNGDataForType(type: 'RG' | 'TN' | 'NG'): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔄 Starting Broker Transaction ${type} calculation...`);
      // Type assertion to fix TypeScript error (method exists but TypeScript doesn't recognize it)
      const result = await (this.calculator as any).generateBrokerTransactionDataForType(type);
      if (result.success) {
        console.log(`✅ Broker Transaction ${type} calculation completed successfully`);
      } else {
        console.error(`❌ Broker Transaction ${type} calculation failed:`, result.message);
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error during Broker Transaction ${type} calculation:`, errorMessage);
      return {
        success: false,
        message: `Failed to generate broker transaction ${type} data: ${errorMessage}`
      };
    }
  }
}

export default BrokerTransactionRGTNNGDataScheduler;

