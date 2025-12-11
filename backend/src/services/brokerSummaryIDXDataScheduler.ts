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
        trigger_type: triggeredBy && !triggeredBy.startsWith('Phase') && !triggeredBy.startsWith('phase') ? 'manual' : 'scheduled',
        triggered_by: triggeredBy || 'Phase 4 Broker Summary',
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
      
      // Get list of all dates from broker_summary folder
      const allDates = await this.getAvailableDates();
      
      if (allDates.length === 0) {
        console.log('⚠️ No dates found with broker summary data');
        return {
          success: false,
          message: 'No dates found with broker summary data'
        };
      }

      console.log(`📅 Found ${allDates.length} dates from broker_summary folder`);

      // Process each market type for all dates
      const marketTypes: Array<'' | 'RG' | 'TN' | 'NG'> = ['', 'RG', 'TN', 'NG'];

      // OPTIMIZATION: Pre-check which dates already have IDX.csv for all market types
      const dates = await this.filterCompleteDates(allDates, marketTypes);
      
      if (dates.length === 0) {
        console.log('✅ All dates already have IDX.csv for all market types - nothing to process');
        return {
          success: true,
          message: `All dates already have IDX.csv for all market types - nothing to process`,
          data: {}
        };
      }

      console.log(`📊 After pre-check: ${dates.length} dates need processing (${allDates.length - dates.length} already complete)`);

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
      const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
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
      const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
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
   * Get available dates from broker_summary folder (main folder only)
   * OPTIMIZED: Use listPrefixes() to list only folder names (not all files) - much faster!
   */
  private async getAvailableDates(): Promise<string[]> {
    try {
      const { listPrefixes } = await import('../utils/azureBlob');
      
      // OPTIMIZATION: Only scan main folder broker_summary/ (not _rg, _tn, _ng)
      // Use listPrefixes() to get folder names only (much faster than listPaths which scans all files)
      const mainFolder = 'broker_summary/';

      const allDates = new Set<string>();

      // Helper function untuk listPrefixes dengan retry logic
      const listPrefixesWithRetry = async (prefix: string, maxRetries = 3): Promise<string[]> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const prefixes = await listPrefixes(prefix);
            return prefixes;
          } catch (error: any) {
            // Check if error is retryable
            const isRetryable = 
              error?.code === 'PARSE_ERROR' ||
              error?.code === 'EADDRNOTAVAIL' ||
              error?.code === 'ECONNRESET' ||
              error?.code === 'ETIMEDOUT' ||
              error?.code === 'ENOTFOUND' ||
              error?.code === 'ECONNREFUSED' ||
              error?.name === 'RestError' ||
              (error?.message && (
                error.message.includes('aborted') ||
                error.message.includes('connect') ||
                error.message.includes('timeout') ||
                error.message.includes('network')
              ));
            
            if (!isRetryable || attempt === maxRetries) {
              // Not retryable or max retries reached
              if (attempt === maxRetries) {
                console.warn(`⚠️ Could not list prefixes in ${prefix} after ${maxRetries} attempts:`, error?.code || error?.message || error);
              } else {
                console.warn(`⚠️ Could not list prefixes in ${prefix} (non-retryable error):`, error?.code || error?.message || error);
              }
              return []; // Return empty array instead of throwing
            }
            
            // Calculate exponential backoff delay: 1s, 2s, 4s
            const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 seconds
            console.warn(`⚠️ listPrefixes failed for ${prefix} (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`, error?.code || error?.message);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
        
        return []; // Return empty array if all retries failed
      };

      // OPTIMIZATION: Use listPrefixes() to get folder names only (not all files)
      // This is MUCH faster - only returns folder names like "broker_summary_20251210/" instead of all files
      console.log('🔍 Scanning broker_summary/ folder for date folders (using listPrefixes - fast!)...');
      
      try {
        const prefixes = await listPrefixesWithRetry(mainFolder);
        
        if (prefixes.length > 0) {
          console.log(`📁 Found ${prefixes.length} date folders in ${mainFolder}`);
          
          prefixes.forEach(prefix => {
            // Extract date from folder name: broker_summary_20241021/
            // Date format is YYYYMMDD (8 digits)
            const m = prefix.match(/broker_summary_(\d{8})\//);
            
            if (m && m[1] && /^\d{8}$/.test(m[1])) {
              allDates.add(m[1]);
            }
          });
        } else {
          console.log(`📁 Folder ${mainFolder} exists but has no date subfolders`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not list prefixes in ${mainFolder} (final error):`, error);
      }

      const dateList = Array.from(allDates).sort().reverse(); // Newest first
      
      // OPTIMIZATION: Only process 7 most recent dates for faster processing
      const MAX_DATES_TO_PROCESS = 7;
      const limitedDateList = dateList.slice(0, MAX_DATES_TO_PROCESS);
      
      if (dateList.length > MAX_DATES_TO_PROCESS) {
        console.log(`📅 Found ${dateList.length} unique dates, limiting to ${MAX_DATES_TO_PROCESS} most recent: ${limitedDateList.join(', ')}`);
      } else {
        console.log(`📅 Found ${dateList.length} unique dates: ${limitedDateList.join(', ')}`);
      }
      
      return limitedDateList;
    } catch (error) {
      console.error('❌ Error getting available dates:', error);
      return [];
    }
  }

  /**
   * Pre-check which dates already have IDX.csv for all market types
   * OPTIMIZED: Batch checking untuk filter dates yang sudah complete
   */
  private async filterCompleteDates(
    dates: string[], 
    marketTypes: Array<'' | 'RG' | 'TN' | 'NG'>
  ): Promise<string[]> {
    console.log(`🔍 Pre-checking existing IDX.csv files (optimized batch checking)...`);
    console.log(`📊 Checking ${dates.length} dates for completeness (${marketTypes.length} market types each)...`);
    
    const { exists } = await import('../utils/azureBlob');
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
    
    for (let i = 0; i < dates.length; i += CHECK_BATCH_SIZE) {
      const batch = dates.slice(i, i + CHECK_BATCH_SIZE);
      const batchNumber = Math.floor(i / CHECK_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(dates.length / CHECK_BATCH_SIZE);
      
      // Process batch checks in parallel with concurrency limit
      const checkPromises = batch.map(async (dateSuffix) => {
        try {
          // Check if ALL market types have IDX.csv
          let allComplete = true;
          
          for (const marketType of marketTypes) {
            const marketLower = marketType.toLowerCase();
            const folderPrefix = marketType === '' 
              ? `broker_summary/broker_summary_${dateSuffix}`
              : `broker_summary_${marketLower}/broker_summary_${marketLower}_${dateSuffix}`;
            
            const idxFilePath = `${folderPrefix}/IDX.csv`;
            const idxExists = await existsWithRetry(idxFilePath);
            
            if (!idxExists) {
              allComplete = false;
              break;
            }
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
            console.log(`⏭️ Date ${result.dateSuffix}: Skip (IDX.csv exists for all market types)`);
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
    console.log(`   ⏭️  Skipped: ${skippedCount} dates (IDX.csv exists for all market types)`);
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
