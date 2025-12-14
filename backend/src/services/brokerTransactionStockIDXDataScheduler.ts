import { listPaths, listPrefixes, exists } from '../utils/azureBlob';
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
   * OPTIMIZED: Use listPrefixes to only scan date folders, limit to 7 most recent dates, with retry logic
   */
  private async getAvailableDates(): Promise<string[]> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // OPTIMIZATION: Use listPrefixes to only list date folders, not all files
        const prefixes = await listPrefixes('broker_transaction_stock/');
        
        if (prefixes.length === 0) {
          console.log('⚠️ No date folders found in broker_transaction_stock/');
          return [];
        }

        const dates = new Set<string>();
        
        // Extract dates from folder names
        // Patterns: broker_transaction_stock_{date}/, broker_transaction_stock_{inv}_{date}/, etc.
        for (const prefix of prefixes) {
          // Extract date (8 digits YYYYMMDD) from folder name
          const dateMatch = prefix.match(/(\d{8})/);
          if (dateMatch && dateMatch[1]) {
            dates.add(dateMatch[1]);
          }
        }

        // Sort dates descending (newest first)
        const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));

        // OPTIMIZATION: Limit to 7 most recent dates
        const MAX_DATES_TO_PROCESS = 7;
        const limitedDates = sortedDates.slice(0, MAX_DATES_TO_PROCESS);

        if (sortedDates.length > MAX_DATES_TO_PROCESS) {
          console.log(`📅 Found ${sortedDates.length} unique dates in broker_transaction_stock/, limiting to ${MAX_DATES_TO_PROCESS} most recent dates`);
        } else {
          console.log(`📅 Found ${sortedDates.length} unique dates in broker_transaction_stock/`);
        }
        
        return limitedDates;
      } catch (error: any) {
        const isRetryable = 
          error?.code === 'PARSE_ERROR' ||
          error?.name === 'RestError' ||
          (error?.message && error.message.includes('aborted'));
        
        if (!isRetryable || attempt === maxRetries) {
          console.error('❌ Error getting available dates:', error);
          return [];
        }
        
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⚠️ Retry ${attempt}/${maxRetries} for getAvailableDates() after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    return [];
  }

  /**
   * Pre-check which dates already have IDX.csv for all combinations
   * OPTIMIZED: Batch checking untuk filter dates yang sudah complete
   * Checks IDX.csv for all investorType × marketType combinations
   */
  private async filterCompleteDates(
    dates: string[],
    investorTypes: Array<'' | 'D' | 'F'>,
    marketTypes: Array<'' | 'RG' | 'TN' | 'NG'>
  ): Promise<string[]> {
    console.log(`🔍 Pre-checking existing IDX.csv files (optimized batch checking)...`);
    console.log(`📊 Checking ${dates.length} dates for completeness (${investorTypes.length} investor types × ${marketTypes.length} market types each)...`);
    
    const datesToProcess: string[] = [];
    let skippedCount = 0;
    
    // Process in batches for parallel checking (faster than sequential)
    const CHECK_BATCH_SIZE = 20; // Check 20 dates in parallel
    const MAX_CONCURRENT_CHECKS = 10; // Max 10 concurrent checks
    
    // Helper function untuk exists dengan retry logic
    const existsWithRetry = async (filePath: string, maxRetries = 2): Promise<boolean> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await exists(filePath);
        } catch (error: any) {
          const isRetryable = 
            error?.code === 'PARSE_ERROR' ||
            error?.name === 'RestError' ||
            (error?.message && error.message.includes('aborted'));
          
          if (!isRetryable || attempt === maxRetries) {
            return false; // Not retryable or max retries reached
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      return false;
    };
    
    // Helper function untuk determine folder path (same logic as calculator)
    const getFolderPrefix = (dateSuffix: string, investorType: '' | 'D' | 'F', marketType: '' | 'RG' | 'TN' | 'NG'): string => {
      if (investorType && marketType) {
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        const marketLower = marketType.toLowerCase();
        return `broker_transaction_stock_${marketLower}_${invPrefix}/broker_transaction_stock_${marketLower}_${invPrefix}_${dateSuffix}`;
      } else if (investorType) {
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        return `broker_transaction_stock/broker_transaction_stock_${invPrefix}_${dateSuffix}`;
      } else if (marketType) {
        const marketLower = marketType.toLowerCase();
        return `broker_transaction_stock_${marketLower}/broker_transaction_stock_${marketLower}_${dateSuffix}`;
      } else {
        return `broker_transaction_stock/broker_transaction_stock_${dateSuffix}`;
      }
    };
    
    for (let i = 0; i < dates.length; i += CHECK_BATCH_SIZE) {
      const batch = dates.slice(i, i + CHECK_BATCH_SIZE);
      const batchNumber = Math.floor(i / CHECK_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(dates.length / CHECK_BATCH_SIZE);
      
      // Process batch checks in parallel with concurrency limit
      const checkPromises = batch.map(async (dateSuffix) => {
        try {
          // Check all combinations: investorType × marketType (for IDX.csv)
          let allComplete = true;
          
          for (const investorType of investorTypes) {
            for (const marketType of marketTypes) {
              const folderPrefix = getFolderPrefix(dateSuffix, investorType, marketType);
              const idxFilePath = `${folderPrefix}/IDX.csv`;
              const idxExists = await existsWithRetry(idxFilePath);
              
              if (!idxExists) {
                allComplete = false;
                break;
              }
            }
            
            if (!allComplete) break;
          }
          
          return { dateSuffix, isComplete: allComplete };
        } catch (error) {
          // If check fails, assume incomplete (safer to process than skip)
          return { dateSuffix, isComplete: false };
        }
      });
      
      // Limit concurrency for checks
      const checkResults: Array<{ dateSuffix: string; isComplete: boolean }> = [];
      for (let j = 0; j < checkPromises.length; j += MAX_CONCURRENT_CHECKS) {
        const concurrentChecks = checkPromises.slice(j, j + MAX_CONCURRENT_CHECKS);
        const results = await Promise.all(concurrentChecks);
        checkResults.push(...results);
      }
      
      // Process results
      for (const result of checkResults) {
        if (result.isComplete) {
          skippedCount++;
          // Only log first few and last few to avoid spam
          if (skippedCount <= 5 || skippedCount > dates.length - 5) {
            console.log(`⏭️ Date ${result.dateSuffix}: Skip (IDX.csv exists for all combinations)`);
          }
        } else {
          // Only log first few to avoid spam
          if (datesToProcess.length < 5) {
            console.log(`✅ Date ${result.dateSuffix} needs processing`);
          }
          datesToProcess.push(result.dateSuffix);
        }
      }
      
      // Progress update for large batches
      if (totalBatches > 1 && batchNumber % 5 === 0) {
        console.log(`📊 Checked ${Math.min(i + CHECK_BATCH_SIZE, dates.length)}/${dates.length} dates (${skippedCount} skipped, ${datesToProcess.length} to process)...`);
      }
    }
    
    // Summary log
    console.log(`📊 Pre-check complete:`);
    console.log(`   ⏭️  Skipped: ${skippedCount} dates (IDX.csv exists for all combinations)`);
    console.log(`   ✅ To process: ${datesToProcess.length} dates`);
    
    if (datesToProcess.length > 0) {
      console.log(`📋 Processing order (newest first):`);
      datesToProcess.slice(0, 10).forEach((date: string, idx: number) => {
        console.log(`   ${idx + 1}. ${date}`);
      });
      if (datesToProcess.length > 10) {
        console.log(`   ... and ${datesToProcess.length - 10} more dates`);
      }
    }
    
    return datesToProcess;
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

      // OPTIMIZATION: Pre-check which dates already have all IDX.csv files
      const datesToProcess = await this.filterCompleteDates(dates, investorTypes, marketTypes);
      
      if (datesToProcess.length === 0) {
        console.log('✅ All dates already have complete IDX.csv files - nothing to process');
        return {
          success: true,
          message: `All dates already have complete IDX.csv files - nothing to process`,
          data: {}
        };
      }

      console.log(`📊 After pre-check: ${datesToProcess.length} dates need processing (${dates.length - datesToProcess.length} already complete)`);
      
      const estimatedTotalStocks = datesToProcess.length * totalCombinations * avgStocksPerDate;
      
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

          const batchResult = await this.calculator.generateIDXBatch(datesToProcess, investorType, marketType, progressTracker);
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

