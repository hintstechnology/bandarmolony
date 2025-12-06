import { listPaths } from '../utils/azureBlob';
import { BrokerTransactionStockIDXCalculator } from '../calculations/broker/broker_transaction_stock_IDX';
import { SchedulerLogService } from './schedulerLogService';

/**
 * Service to schedule and manage Broker Transaction Stock IDX data generation
 * IDX.csv aggregates all brokers from all stocks into a single aggregated file per broker
 */
class BrokerTransactionStockIDXDataScheduler {
  private calculator: BrokerTransactionStockIDXCalculator;

  constructor() {
    this.calculator = new BrokerTransactionStockIDXCalculator();
  }

  /**
   * Get list of available dates from broker_transaction_stock folders
   */
  private async getAvailableDates(): Promise<string[]> {
    try {
      const allFiles = await listPaths({ prefix: 'broker_transaction_stock/' });
      
      if (allFiles.length === 0) {
        console.log('⚠️ No files found in broker_transaction_stock/');
        return [];
      }

      const dates = new Set<string>();
      
      // Extract dates from folder names
      // Patterns: broker_transaction_stock/broker_transaction_stock_{date}/, broker_transaction_stock/broker_transaction_stock_{inv}_{date}/, etc.
      for (const file of allFiles) {
        const parts = file.split('/');
        if (parts.length >= 2) {
          const folderName = parts[1]; // broker_transaction_stock_{date} or broker_transaction_stock_{inv}_{date}
          
          // Extract date (8 digits YYYYMMDD) from folder name
          if (folderName) {
            const dateMatch = folderName.match(/(\d{8})/);
            if (dateMatch && dateMatch[1]) {
              dates.add(dateMatch[1]);
            }
          }
        }
      }

      // Sort dates descending (newest first)
      const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));

      console.log(`📅 Found ${sortedDates.length} unique dates in broker_transaction_stock/`);
      return sortedDates;
    } catch (error) {
      console.error('❌ Error getting available dates:', error);
      return [];
    }
  }

  /**
   * Generate IDX.csv for all dates, and market types
   * @param _scope 'all' to process all available dates (reserved for future use)
   * @param logId Optional log ID for progress tracking (if provided, uses existing log entry)
   * @param triggeredBy Optional trigger source for logging
   */
  async generateBrokerTransactionStockIDXData(_scope: 'all' = 'all', logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message?: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_transaction_stock_idx',
        trigger_type: triggeredBy && !triggeredBy.startsWith('Phase') && !triggeredBy.startsWith('phase') ? 'manual' : 'scheduled',
        triggered_by: triggeredBy || 'Phase 6 Broktrans Stock',
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
      console.log('🔄 Generating Broker Transaction Stock IDX (aggregated all brokers per stock)...');
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Broker Transaction Stock IDX calculation...'
        });
      }
      
      // Get list of all dates from broker_transaction_stock folders
      const dates = await this.getAvailableDates();
      
      if (dates.length === 0) {
        console.log('⚠️ No dates found with broker transaction stock data');
        // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
        const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
        if (finalLogId && !isFromPhase) {
          await SchedulerLogService.markFailed(finalLogId, 'No dates found with broker transaction stock data');
        }
        return {
          success: false,
          message: 'No dates found with broker transaction stock data'
        };
      }

      console.log(`📅 Found ${dates.length} dates to process`);

      // Estimate total stocks: average stocks per date * dates * combinations
      // Typical stock count per date is around 600-800, we'll use 700 as average
      const avgStocksPerDate = 700;
      const investorTypes: Array<'D' | 'F' | ''> = ['', 'D', 'F'];
      const marketTypes: Array<'RG' | 'TN' | 'NG' | ''> = ['', 'RG', 'TN', 'NG'];
      const totalCombinations = investorTypes.length * marketTypes.length;
      const estimatedTotalStocks = dates.length * totalCombinations * avgStocksPerDate;
      
      // Create progress tracker for thread-safe stock counting
      const progressTracker: { totalStocks: number; processedStocks: number; logId: string | null; updateProgress: () => Promise<void> } = {
        totalStocks: estimatedTotalStocks,
        processedStocks: 0,
        logId: finalLogId || null,
        updateProgress: async () => {
          if (progressTracker.logId) {
            const percentage = estimatedTotalStocks > 0 
              ? Math.min(100, Math.round((progressTracker.processedStocks / estimatedTotalStocks) * 100))
              : 0;
            await SchedulerLogService.updateLog(progressTracker.logId, {
              progress_percentage: percentage,
              current_processing: `Processing stocks: ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} stocks processed`
            });
          }
        }
      };
      
      let processedCombinations = 0;
      let totalSuccess = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      const results: any = {};

      for (const investorType of investorTypes) {
        for (const marketType of marketTypes) {
          const comboName = investorType 
            ? (marketType ? `${investorType}_${marketType}` : investorType)
            : (marketType ? marketType : 'all');
          
          console.log(`\n🔄 Processing ${comboName}...`);
          
          // Update progress before combination
          if (finalLogId) {
            await SchedulerLogService.updateLog(finalLogId, {
              progress_percentage: estimatedTotalStocks > 0 
                ? Math.min(100, Math.round((progressTracker.processedStocks / estimatedTotalStocks) * 100))
                : Math.round((processedCombinations / totalCombinations) * 100),
              current_processing: `Processing ${comboName}... (${processedCombinations}/${totalCombinations} combinations, ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} stocks)`
            });
          }
          
          // Check if this combination exists by checking first date
          // If no stocks found, skip this combination
          // Path structure mengikuti inkonsistensi di Azure (sama seperti calculation):
          // - Jika ada marketType (RG/TN/NG): TIDAK ada broker_transaction_stock/ di depan
          //   Contoh: broker_transaction_stock_rg_f/broker_transaction_stock_rg_f_20251205/
          // - Jika TIDAK ada marketType: ADA broker_transaction_stock/ di depan
          //   Contoh: broker_transaction_stock/broker_transaction_stock_f_20251205/
          let folderPrefix: string;
          if (investorType && marketType) {
            const invPrefix = investorType === 'D' ? 'd' : 'f';
            const marketLower = marketType.toLowerCase();
            folderPrefix = `broker_transaction_stock_${marketLower}_${invPrefix}/broker_transaction_stock_${marketLower}_${invPrefix}_${dates[0]}`;
          } else if (investorType) {
            const invPrefix = investorType === 'D' ? 'd' : 'f';
            folderPrefix = `broker_transaction_stock/broker_transaction_stock_${invPrefix}_${dates[0]}`;
          } else if (marketType) {
            const marketLower = marketType.toLowerCase();
            folderPrefix = `broker_transaction_stock_${marketLower}/broker_transaction_stock_${marketLower}_${dates[0]}`;
          } else {
            folderPrefix = `broker_transaction_stock/broker_transaction_stock_${dates[0]}`;
          }

          const testFiles = await listPaths({ prefix: `${folderPrefix}/` });
          const stockFiles = testFiles.filter(file => {
            const fileName = file.split('/').pop() || '';
            return fileName.endsWith('.csv') && fileName.toUpperCase() !== 'IDX.CSV' && /^[A-Z]{4}\.csv$/.test(fileName);
          });

          if (stockFiles.length === 0) {
            console.log(`⏭️ Skipping ${comboName} - no stocks found for this combination`);
            processedCombinations++;
            continue;
          }

          const batchResult = await this.calculator.generateIDXBatch(dates, investorType, marketType, progressTracker);
          results[comboName] = batchResult;
          totalSuccess += batchResult.success;
          totalFailed += batchResult.failed;
          totalSkipped += batchResult.skipped || 0;
          
          // Calculate total stocks processed from batch results
          const stocksProcessed = batchResult.results.reduce((sum, r) => sum + (r.stockCount || 0), 0);
          
          processedCombinations++;
          console.log(`✅ ${comboName}: ${batchResult.success} success, ${batchResult.skipped || 0} skipped, ${batchResult.failed} failed, ${stocksProcessed} stocks processed`);
          
          // Update progress after combination (based on stocks processed)
          if (finalLogId) {
            await SchedulerLogService.updateLog(finalLogId, {
              progress_percentage: estimatedTotalStocks > 0 
                ? Math.min(100, Math.round((progressTracker.processedStocks / estimatedTotalStocks) * 100))
                : Math.round((processedCombinations / totalCombinations) * 100),
              current_processing: `Completed ${comboName} (${processedCombinations}/${totalCombinations} combinations, ${progressTracker.processedStocks.toLocaleString()}/${estimatedTotalStocks.toLocaleString()} stocks processed)`
            });
          }
        }
      }

      const totalProcessed = totalSuccess + totalFailed + totalSkipped;
      console.log(`\n📊 ===== BROKER TRANSACTION STOCK IDX GENERATION COMPLETED =====`);
      console.log(`✅ Total Success: ${totalSuccess}/${totalProcessed}`);
      console.log(`⏭️  Total Skipped: ${totalSkipped}/${totalProcessed}`);
      console.log(`❌ Total Failed: ${totalFailed}/${totalProcessed}`);

      // Check if this is called from a Phase (don't mark completed/failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
      if (finalLogId && !isFromPhase) {
        if (totalSuccess > 0) {
          await SchedulerLogService.markCompleted(finalLogId, {
            total_files_processed: totalProcessed,
            files_created: totalSuccess,
            files_failed: totalFailed
          });
        } else {
          await SchedulerLogService.markFailed(finalLogId, `No IDX files generated successfully`);
        }
      }

      return {
        success: totalSuccess > 0,
        message: `Generated ${totalSuccess} IDX files, skipped ${totalSkipped}, failed ${totalFailed}`,
        data: {
          success: totalSuccess,
          failed: totalFailed,
          skipped: totalSkipped,
          results
        }
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error generating Broker Transaction Stock IDX data:', errorMessage);
      // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
      if (finalLogId && !isFromPhase) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate Broker Transaction Stock IDX data: ${errorMessage}`
      };
    }
  }
}

export { BrokerTransactionStockIDXDataScheduler };
export default BrokerTransactionStockIDXDataScheduler;

