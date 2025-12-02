import { BrokerSummaryIDXCalculator } from '../calculations/broker/broker_summary_IDX';
import { SchedulerLogService } from './schedulerLogService';

// Progress tracker interface for thread-safe broker counting
interface ProgressTracker {
  totalBrokers: number;
  processedBrokers: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

export class BrokerSummaryIDXDataScheduler {
  private calculator: BrokerSummaryIDXCalculator;

  constructor() {
    this.calculator = new BrokerSummaryIDXCalculator();
  }

  /**
   * Generate IDX.csv for all dates and market types
   * @param _scope 'all' to process all available dates (reserved for future use)
   */
  async generateBrokerSummaryIDXData(_scope: 'all' = 'all', logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message?: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_summary_idx',
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
      console.log('🔄 Generating Broker Summary IDX (aggregated all emiten)...');
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Broker Summary IDX calculation...'
        });
      }
      
      // Get list of all dates from broker_summary folders
      const dates = await this.getAvailableDates();
      
      if (dates.length === 0) {
        console.log('⚠️ No dates found with broker summary data');
        return {
          success: false,
          message: 'No dates found with broker summary data'
        };
      }

      console.log(`📅 Found ${dates.length} dates to process`);

      // Estimate total brokers: average brokers per date * dates * market types
      // Typical broker count per date is around 100-150, we'll use 120 as average
      const avgBrokersPerDate = 120;
      const estimatedTotalBrokers = dates.length * marketTypes.length * avgBrokersPerDate;
      
      // Create progress tracker for thread-safe broker counting
      const progressTracker: ProgressTracker = {
        totalBrokers: estimatedTotalBrokers,
        processedBrokers: 0,
        logId: finalLogId || null,
        updateProgress: async () => {
          if (progressTracker.logId) {
            const percentage = estimatedTotalBrokers > 0 
              ? Math.min(100, Math.round((progressTracker.processedBrokers / estimatedTotalBrokers) * 100))
              : 0;
            await SchedulerLogService.updateLog(progressTracker.logId, {
              progress_percentage: percentage,
              current_processing: `Processing brokers: ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers processed`
            });
          }
        }
      };

      // Process each market type for all dates
      const marketTypes: Array<'' | 'RG' | 'TN' | 'NG'> = ['', 'RG', 'TN', 'NG'];
      let totalSuccess = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      const results: any = {};

      for (let idx = 0; idx < marketTypes.length; idx++) {
        const marketType = marketTypes[idx];
        console.log(`\n🔄 Processing ${marketType || 'All Trade'} market (${idx + 1}/${marketTypes.length})...`);
        
        // Update progress before market type
        if (finalLogId) {
          await SchedulerLogService.updateLog(finalLogId, {
            progress_percentage: estimatedTotalBrokers > 0 
              ? Math.min(100, Math.round((progressTracker.processedBrokers / estimatedTotalBrokers) * 100))
              : Math.round((idx / marketTypes.length) * 100),
            current_processing: `Processing ${marketType || 'All Trade'} market (${idx + 1}/${marketTypes.length}, ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers)...`
          });
        }
        
        const batchResult = await this.calculator.generateIDXBatch(dates, marketType, progressTracker);
        results[marketType || 'all'] = batchResult;
        totalSuccess += batchResult.success;
        totalFailed += batchResult.failed;
        totalSkipped += batchResult.skipped || 0;
        
        // Calculate total brokers processed from batch results
        const brokersProcessed = batchResult.results.reduce((sum, r) => sum + (r.brokerCount || 0), 0);
        
        console.log(`✅ ${marketType || 'All Trade'}: ${batchResult.success} success, ${batchResult.skipped || 0} skipped, ${batchResult.failed} failed, ${brokersProcessed} brokers processed`);
        
        // Update progress after each market type (based on brokers processed)
        if (finalLogId) {
          await SchedulerLogService.updateLog(finalLogId, {
            progress_percentage: estimatedTotalBrokers > 0 
              ? Math.min(100, Math.round((progressTracker.processedBrokers / estimatedTotalBrokers) * 100))
              : Math.round(((idx + 1) / marketTypes.length) * 100),
            current_processing: `Completed ${marketType || 'All Trade'} market (${idx + 1}/${marketTypes.length}, ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers processed)`
          });
        }
      }

      const totalProcessed = totalSuccess + totalFailed + totalSkipped;
      console.log(`\n📊 ===== IDX GENERATION COMPLETED =====`);
      console.log(`✅ Total Success: ${totalSuccess}/${totalProcessed}`);
      console.log(`⏭️  Total Skipped: ${totalSkipped}/${totalProcessed}`);
      console.log(`❌ Total Failed: ${totalFailed}/${totalProcessed}`);

      const finalSuccess = totalSuccess > 0 || totalSkipped > 0;
      // Check if this is called from a Phase (don't mark completed/failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
      if (finalLogId && !isFromPhase) {
        if (finalSuccess) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: totalProcessed,
            files_created: totalSuccess,
            files_skipped: totalSkipped,
            files_failed: totalFailed
          });
        } else {
          await SchedulerLogService.markFailed(finalLogId, `IDX generation failed: ${totalFailed} failed across ${marketTypes.length} market types`);
        }
      }

      return {
        success: finalSuccess,
        message: `IDX generation completed: ${totalSuccess} success, ${totalSkipped} skipped, ${totalFailed} failed across ${marketTypes.length} market types`,
        data: results
      };
    } catch (error: any) {
      console.error('❌ Broker Summary IDX generation failed:', error?.message || error);
      const errorMessage = error?.message || 'Unknown error';
      // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
      if (finalLogId && !isFromPhase) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: errorMessage
      };
    }
  }

  /**
   * Generate IDX.csv for a specific date and market type
   * @param dateSuffix Date in YYYYMMDD format
   * @param marketType Market type: '' (all), 'RG', 'TN', or 'NG'
   */
  async generateBrokerSummaryIDXForDate(dateSuffix: string, marketType: '' | 'RG' | 'TN' | 'NG' = ''): Promise<{ success: boolean; message?: string; file?: string }> {
    try {
      console.log(`🔄 Generating IDX for date ${dateSuffix}, market ${marketType || 'All Trade'}...`);
      const result = await this.calculator.generateIDX(dateSuffix, marketType);
      
      if (result.success) {
        console.log(`✅ IDX generation completed for ${dateSuffix}, ${marketType || 'All Trade'}`);
      } else {
        console.error(`❌ IDX generation failed for ${dateSuffix}, ${marketType || 'All Trade'}:`, result.message);
      }
      
      return result;
    } catch (error: any) {
      console.error(`❌ Error generating IDX for ${dateSuffix}, ${marketType || 'All Trade'}:`, error?.message || error);
      return {
        success: false,
        message: error?.message || 'Unknown error'
      };
    }
  }

  /**
   * Get available dates from broker_summary folders
   */
  private async getAvailableDates(): Promise<string[]> {
    try {
      const { listPaths } = await import('../utils/azureBlob');
      
      // Check all market type folders
      const marketFolders = [
        'broker_summary/',
        'broker_summary_rg/',
        'broker_summary_tn/',
        'broker_summary_ng/'
      ];

      const allDates = new Set<string>();

      for (const folder of marketFolders) {
        try {
          const paths = await listPaths({ prefix: folder });
          console.log(`📁 Found ${paths.length} paths in ${folder}`);
          
          paths.forEach(path => {
            // Extract date from path patterns:
            // - broker_summary_rg/broker_summary_rg_20241021/BBCA.csv
            // - broker_summary_rg/broker_summary_rg_20241021/IDX.csv
            // - broker_summary/broker_summary_20241021/BBCA.csv
            // - broker_summary/broker_summary_20241021/IDX.csv
            // Date format is YYYYMMDD (8 digits)
            
            // Match modern path: broker_summary_rg/broker_summary_rg_20241021/...
            const m1 = path.match(/broker_summary_(rg|tn|ng)\/broker_summary_(rg|tn|ng)_(\d{8})\//);
            // Match legacy path: broker_summary/broker_summary_20241021/...
            const m2 = path.match(/broker_summary\/broker_summary_(\d{8})\//);
            
            if (m1 && m1[3] && /^\d{8}$/.test(m1[3])) {
              allDates.add(m1[3]);
            }
            if (m2 && m2[1] && /^\d{8}$/.test(m2[1])) {
              allDates.add(m2[1]);
            }
          });
        } catch (error) {
          // Continue if folder doesn't exist
          console.warn(`⚠️ Could not list paths in ${folder}:`, error);
        }
      }

      const dateList = Array.from(allDates).sort().reverse(); // Newest first
      console.log(`📅 Found ${dateList.length} unique dates: ${dateList.slice(0, 10).join(', ')}${dateList.length > 10 ? '...' : ''}`);
      return dateList;
    } catch (error) {
      console.error('❌ Error getting available dates:', error);
      return [];
    }
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Summary IDX service is ready to generate data'
    };
  }
}

export default BrokerSummaryIDXDataScheduler;
