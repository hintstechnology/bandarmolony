import { BrokerDataRGTNNGCalculator } from '../calculations/broker/broker_data_rg_tn_ng';
import { SchedulerLogService } from './schedulerLogService';

class BrokerSummaryTypeDataScheduler {
  private calculator: BrokerDataRGTNNGCalculator;

  constructor() {
    this.calculator = new BrokerDataRGTNNGCalculator();
  }

  // Generate broker summaries split per TRX_TYPE (RG/TN/NG)
  // Scope: 'all' for all available DT files
  async generateBrokerSummaryTypeData(_scope: 'all' = 'all', logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message?: string }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_summary_type',
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
      console.log('🔄 Generating Broker Summary by Type (RG/TN/NG)...');
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Broker Summary Type calculation...'
        });
      }
      
      // Type assertion to fix TypeScript error (method exists but TypeScript doesn't recognize it)
      const result = await (this.calculator as any).generateBrokerSummarySplitPerType();
      
      // Check if this is called from a Phase (don't mark completed/failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
      
      if (result.success) {
        console.log(`✅ Broker Summary Type calculation completed: ${result.message || 'Success'}`);
        if (finalLogId && !isFromPhase) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: 1,
            files_created: 1,
            files_failed: 0
          });
        }
      } else {
        console.error(`❌ Broker Summary Type calculation failed: ${result.message || 'Unknown error'}`);
        if (finalLogId && !isFromPhase) {
          await SchedulerLogService.markFailed(finalLogId, result.message || 'Unknown error');
        }
      }
      
      return { success: result.success, message: result.message || 'Success' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      console.error('❌ Broker Summary by Type generation failed:', errorMessage);
      // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
      if (finalLogId && !isFromPhase) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return { success: false, message: errorMessage };
    }
  }
}

export default BrokerSummaryTypeDataScheduler;


