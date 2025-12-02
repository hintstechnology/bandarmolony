import { BrokerInventoryCalculator } from '../calculations/broker/broker_inventory';
import { SchedulerLogService } from './schedulerLogService';

export class BrokerInventoryDataScheduler {
  private calculator: BrokerInventoryCalculator;

  constructor() {
    this.calculator = new BrokerInventoryCalculator();
  }

  /**
   * Generate broker inventory data
   */
  async generateBrokerInventoryData(dateSuffix?: string, logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_inventory',
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
      console.log(`🔄 Starting Broker Inventory calculation for date: ${targetDate}`);
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: `Starting Broker Inventory calculation for ${targetDate}...`
        });
      }
      
      await this.calculator.generateBrokerInventoryData(targetDate, finalLogId);
      console.log('✅ Broker Inventory calculation completed successfully');
      
      // Check if this is called from a Phase (don't mark completed/failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
      
      if (finalLogId && !isFromPhase) {
        await SchedulerLogService.markCompleted(finalLogId, {
          total_files_processed: 1,
          files_created: 1,
          files_failed: 0
        });
      }
      
      return {
        success: true,
        message: `Broker inventory data generated successfully for ${targetDate}`,
        data: {
          date: targetDate,
          status: 'completed'
        }
      };
    } catch (error) {
      console.error('❌ Error during Broker Inventory calculation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
      if (finalLogId && !isFromPhase) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate broker inventory data: ${errorMessage}`
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
      message: 'Broker Inventory service is ready to generate data'
    };
  }
}

export default BrokerInventoryDataScheduler;

