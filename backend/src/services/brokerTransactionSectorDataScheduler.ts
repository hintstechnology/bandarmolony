import { BrokerTransactionSectorCalculator } from '../calculations/broker/broker_transaction_sector';
import { SchedulerLogService } from './schedulerLogService';
import { listPrefixes } from '../utils/azureBlob';
import { downloadText } from '../utils/azureBlob';

// Progress tracker interface for thread-safe broker counting
interface ProgressTracker {
  totalBrokers: number;
  processedBrokers: number;
  logId: string | null;
  updateProgress: () => Promise<void>;
}

// Sector mapping cache - loaded from csv_input/sector_mapping.csv
// OPTIMIZATION: Cache dengan timestamp untuk avoid reload berulang
let SECTOR_MAPPING: { [key: string]: string[] } = {};
let SECTOR_MAPPING_TIMESTAMP: number = 0;
const SECTOR_MAPPING_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Build sector mapping from csv_input/sector_mapping.csv
 * OPTIMIZED: Cache dengan TTL untuk avoid reload berulang
 */
async function buildSectorMappingFromCsv(): Promise<void> {
  // Check if cache is still valid
  const now = Date.now();
  if (Object.keys(SECTOR_MAPPING).length > 0 && (now - SECTOR_MAPPING_TIMESTAMP) < SECTOR_MAPPING_CACHE_TTL) {
    console.log('📦 Using cached sector mapping (age: ' + Math.round((now - SECTOR_MAPPING_TIMESTAMP) / 1000) + 's)');
    return;
  }
  
  try {
    console.log('🔍 Building sector mapping from csv_input/sector_mapping.csv...');
    
    // Reset mapping
    Object.keys(SECTOR_MAPPING).forEach(sector => {
      SECTOR_MAPPING[sector] = [];
    });
    
    // Load sector mapping from CSV file
    const csvData = await downloadText('csv_input/sector_mapping.csv');
    const lines = csvData.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;
      
      const parts = line.split(',');
      if (parts.length >= 2) {
        const sector = parts[0]?.trim();
        const emiten = parts[1]?.trim();
        
        if (sector && emiten && emiten.length === 4) {
          if (!SECTOR_MAPPING[sector]) {
            SECTOR_MAPPING[sector] = [];
          }
          if (!SECTOR_MAPPING[sector].includes(emiten)) {
            SECTOR_MAPPING[sector].push(emiten);
          }
        }
      }
    }
    
    // Update cache timestamp
    SECTOR_MAPPING_TIMESTAMP = now;
    
    console.log('📊 Sector mapping built successfully from CSV');
    console.log(`📊 Found ${Object.keys(SECTOR_MAPPING).length} sectors with total ${Object.values(SECTOR_MAPPING).flat().length} emitens`);
  } catch (error) {
    console.warn('⚠️ Could not build sector mapping from CSV:', error);
    console.log('⚠️ Using empty sector mapping');
    SECTOR_MAPPING = {};
    SECTOR_MAPPING_TIMESTAMP = 0;
  }
}

export class BrokerTransactionSectorDataScheduler {
  private calculator: BrokerTransactionSectorCalculator;

  constructor() {
    this.calculator = new BrokerTransactionSectorCalculator();
  }

  /**
   * Get list of available dates from broker_transaction folders
   * OPTIMIZED: Only scan main folder pattern (broker_transaction_{date}/) for speed, limit to 7 most recent dates
   */
  private async getAvailableDates(): Promise<string[]> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // OPTIMIZATION: Only scan main folder pattern broker_transaction/broker_transaction_{date}/
        // Tidak perlu scan semua kombinasi investorType × marketType untuk speed
        const mainFolderPrefix = 'broker_transaction/';
        const prefixes = await listPrefixes(mainFolderPrefix);
        
        if (prefixes.length === 0) {
          console.log('⚠️ No date folders found in broker_transaction/');
          return [];
        }

        const dates = new Set<string>();
        
        // Extract dates only from main folder pattern: broker_transaction_{date}/
        // Exclude: broker_transaction_{inv}_{date}/, broker_transaction_{market}_{date}/, etc.
        for (const prefix of prefixes) {
          // Only match exact pattern: broker_transaction_YYYYMMDD/
          const dateMatch = prefix.match(/^broker_transaction\/broker_transaction_(\d{8})\/$/);
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
          console.log(`📅 Found ${sortedDates.length} unique dates in broker_transaction/ (main folder only), limiting to ${MAX_DATES_TO_PROCESS} most recent dates`);
        } else {
          console.log(`📅 Found ${sortedDates.length} unique dates in broker_transaction/ (main folder only)`);
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
   * Generate sector CSV for all dates, market types, investor types, and sectors
   * @param _scope 'all' to process all available dates (reserved for future use)
   */
  async generateBrokerTransactionSectorData(_scope: 'all' = 'all', logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message?: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_transaction_sector',
        trigger_type: triggeredBy ? 'manual' : 'scheduled',
        triggered_by: triggeredBy || 'Scheduler',
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
      console.log('🔄 Generating Broker Transaction Sector (aggregated by sector)...');
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Broker Transaction Sector calculation...'
        });
      }
      
      // Build sector mapping first
      await buildSectorMappingFromCsv();
      
      // Get list of all sectors (exclude IDX as it's handled separately)
      const sectors = Object.keys(SECTOR_MAPPING).filter(sector => 
        sector !== 'IDX' && SECTOR_MAPPING[sector] && SECTOR_MAPPING[sector].length > 0
      );
      
      if (sectors.length === 0) {
        console.log('⚠️ No sectors found in sector mapping');
        return {
          success: false,
          message: 'No sectors found in sector mapping'
        };
      }

      console.log(`📊 Found ${sectors.length} sectors to process: ${sectors.slice(0, 10).join(', ')}${sectors.length > 10 ? '...' : ''}`);
      
      // Get list of all dates from broker_transaction folders
      const dates = await this.getAvailableDates();
      
      if (dates.length === 0) {
        console.log('⚠️ No dates found with broker transaction data');
        return {
          success: false,
          message: 'No dates found with broker transaction data'
        };
      }

      console.log(`📅 Found ${dates.length} dates to process`);

      // Process each date, then all investor types, then all market types, then all sectors for that date
      const investorTypes: Array<'' | 'D' | 'F'> = ['', 'D', 'F'];
      const marketTypes: Array<'' | 'RG' | 'TN' | 'NG'> = ['', 'RG', 'TN', 'NG'];

      // OPTIMIZATION: Pre-check which dates already have all sectors (main folder only for speed)
      const datesToProcess = await this.filterCompleteDates(dates, sectors);
      
      if (datesToProcess.length === 0) {
        console.log('✅ All dates already have complete sector files - nothing to process');
        return {
          success: true,
          message: `All dates already have complete sector files - nothing to process`,
          data: {}
        };
      }

      console.log(`📊 After pre-check: ${datesToProcess.length} dates need processing (${dates.length - datesToProcess.length} already complete)`);

      // Estimate total brokers: average brokers per date * dates * investor types * market types * sectors
      // Typical broker count per date is around 100-150, we'll use 120 as average
      const avgBrokersPerDate = 120;
      const estimatedTotalBrokers = datesToProcess.length * investorTypes.length * marketTypes.length * sectors.length * avgBrokersPerDate;
      
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

      // OPTIMIZATION: Parallel processing untuk dates dengan concurrency limit
      // Process dates in batches untuk balance speed dan memory
      const DATE_BATCH_SIZE = 3; // Process 3 dates in parallel
      const MAX_CONCURRENT_DATES = 2; // Max 2 concurrent dates (untuk avoid memory overload)
      
      // Helper function untuk process single date
      const processSingleDate = async (dateSuffix: string, dateIdx: number): Promise<{
        dateSuffix: string;
        success: number;
        failed: number;
        skipped: number;
        dateResults: any;
      }> => {
        const dateResults: any = {};
        let dateSuccess = 0;
        let dateFailed = 0;
        let dateSkipped = 0;
        
        console.log(`\n📅 Processing date ${dateSuffix} (${dateIdx + 1}/${datesToProcess.length})...`);
        
        // Initialize results for this date
        if (!dateResults[dateSuffix]) {
          dateResults[dateSuffix] = {};
        }
        
        // For each investor type
        for (let invIdx = 0; invIdx < investorTypes.length; invIdx++) {
          const investorTypeValue = investorTypes[invIdx];
          if (investorTypeValue === undefined) continue;
          
          const investorType: '' | 'D' | 'F' = investorTypeValue;
          const invKey: string = investorType || 'all';
          
          // Initialize results for this date + investor type
          if (!dateResults[dateSuffix][invKey]) {
            dateResults[dateSuffix][invKey] = {};
          }
          
          // For each market type
          for (let marketIdx = 0; marketIdx < marketTypes.length; marketIdx++) {
            const marketTypeValue = marketTypes[marketIdx];
            if (marketTypeValue === undefined) continue;
            
            const marketType: '' | 'RG' | 'TN' | 'NG' = marketTypeValue;
            const marketKey: string = marketType || 'all';
            console.log(`\n  🔄 Processing ${investorType || 'All'} investor, ${marketType || 'All Trade'} market (${marketIdx + 1}/${marketTypes.length})...`);
            
            // Initialize results for this date + investor type + market
            if (!dateResults[dateSuffix][invKey][marketKey]) {
              dateResults[dateSuffix][invKey][marketKey] = {};
            }
            
            // For each sector (process all sectors for this date + investor type + market)
            for (let sectorIdx = 0; sectorIdx < sectors.length; sectorIdx++) {
              const sectorNameValue = sectors[sectorIdx];
              if (!sectorNameValue) continue;
              
              const sectorName: string = sectorNameValue;
              console.log(`\n    📊 Processing sector ${sectorName} (${sectorIdx + 1}/${sectors.length})...`);
              
              // Update progress
              if (finalLogId) {
                const dateProgress = dateIdx / datesToProcess.length;
                const invProgress = invIdx / (datesToProcess.length * investorTypes.length);
                const marketProgress = marketIdx / (datesToProcess.length * investorTypes.length * marketTypes.length);
                const sectorProgress = sectorIdx / (datesToProcess.length * investorTypes.length * marketTypes.length * sectors.length);
                const overallProgress = (dateProgress + (invProgress + (marketProgress + sectorProgress / marketTypes.length) / investorTypes.length) / datesToProcess.length) * 100;
                await SchedulerLogService.updateLog(finalLogId, {
                  progress_percentage: Math.min(100, Math.round(overallProgress)),
                  current_processing: `Processing ${dateSuffix}, ${investorType || 'All'} investor, ${marketType || 'All Trade'} market, sector ${sectorName} (${sectorIdx + 1}/${sectors.length}, ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers)...`
                });
              }
              
              // Process single date + sector (not batch)
              try {
                const result = await this.calculator.generateSector(
                  dateSuffix,
                  sectorName as string,
                  investorType as '' | 'D' | 'F',
                  marketType as '' | 'RG' | 'TN' | 'NG',
                  progressTracker
                );
                
                // Store result
                const dateInvMarketResults = dateResults[dateSuffix][invKey][marketKey];
                if (dateInvMarketResults) {
                  dateInvMarketResults[sectorName as string] = result;
                }
                
                // Update counters
                if (result.success) {
                  if (result.message?.includes('already exists')) {
                    dateSkipped++;
                  } else {
                    dateSuccess++;
                  }
                } else {
                  dateFailed++;
                }
                
                // Update broker count if available
                if (result.brokerCount && progressTracker) {
                  progressTracker.processedBrokers += result.brokerCount;
                  await progressTracker.updateProgress();
                }
                
                const status = result.message?.includes('already exists') ? 'skipped' : (result.success ? 'success' : 'failed');
                console.log(`    ${status === 'success' ? '✅' : status === 'skipped' ? '⏭️' : '❌'} ${sectorName}: ${status}${result.brokerCount ? ` (${result.brokerCount} brokers)` : ''}`);
              } catch (error: any) {
                dateFailed++;
                const errorMsg = error?.message || 'Unknown error';
                console.error(`    ❌ ${sectorName}: Error - ${errorMsg}`);
                
                // Store error result
                const dateInvMarketResults = dateResults[dateSuffix][invKey][marketKey];
                if (dateInvMarketResults) {
                  dateInvMarketResults[sectorName as string] = {
                    success: false,
                    message: errorMsg
                  };
                }
              }
            }
            
            console.log(`  ✅ ${investorType || 'All'} investor, ${marketType || 'All Trade'}: Completed all sectors for date ${dateSuffix}`);
          }
        }
        
        console.log(`✅ Date ${dateSuffix}: Completed all investor types, market types, and sectors`);
        
        return {
          dateSuffix,
          success: dateSuccess,
          failed: dateFailed,
          skipped: dateSkipped,
          dateResults
        };
      };
      
      // Process dates in batches dengan concurrency limit
      for (let i = 0; i < datesToProcess.length; i += DATE_BATCH_SIZE) {
        const dateBatch = datesToProcess.slice(i, i + DATE_BATCH_SIZE);
        const batchNumber = Math.floor(i / DATE_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(datesToProcess.length / DATE_BATCH_SIZE);
        
        console.log(`\n📦 Processing date batch ${batchNumber}/${totalBatches} (${dateBatch.length} dates)...`);
        
        // Process batch dengan concurrency limit
        const datePromises = dateBatch.map((dateSuffix, batchIdx) => 
          processSingleDate(dateSuffix, i + batchIdx)
        );
        
        // Limit concurrency untuk dates
        const dateResults: Array<{
          dateSuffix: string;
          success: number;
          failed: number;
          skipped: number;
          dateResults: any;
        }> = [];
        
        for (let j = 0; j < datePromises.length; j += MAX_CONCURRENT_DATES) {
          const concurrentDates = datePromises.slice(j, j + MAX_CONCURRENT_DATES);
          const batchResults = await Promise.all(concurrentDates);
          dateResults.push(...batchResults);
        }
        
        // Aggregate results
        dateResults.forEach(({ dateSuffix, success, failed, skipped, dateResults: dateRes }) => {
          results[dateSuffix] = dateRes[dateSuffix] || {};
          totalSuccess += success;
          totalFailed += failed;
          totalSkipped += skipped;
        });
        
        console.log(`📊 Date batch ${batchNumber} complete: ${dateResults.reduce((sum, r) => sum + r.success, 0)} success, ${dateResults.reduce((sum, r) => sum + r.skipped, 0)} skipped, ${dateResults.reduce((sum, r) => sum + r.failed, 0)} failed`);
        
        // Memory cleanup after batch
        if (global.gc) {
          global.gc();
          const memAfter = process.memoryUsage();
          const heapUsedMB = memAfter.heapUsed / 1024 / 1024;
          console.log(`📊 Date batch ${batchNumber} complete - Memory: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        // Small delay between batches
        if (i + DATE_BATCH_SIZE < datesToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const totalProcessed = totalSuccess + totalFailed + totalSkipped;
      console.log(`\n📊 ===== SECTOR GENERATION COMPLETED =====`);
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
          await SchedulerLogService.markFailed(finalLogId, `Sector generation failed: ${totalFailed} failed across ${investorTypes.length} investor types, ${marketTypes.length} market types and ${sectors.length} sectors`);
        }
      }

      return {
        success: finalSuccess,
        message: `Sector generation completed: ${totalSuccess} success, ${totalSkipped} skipped, ${totalFailed} failed across ${investorTypes.length} investor types, ${marketTypes.length} market types and ${sectors.length} sectors`,
        data: results
      };
    } catch (error: any) {
      console.error('❌ Error in broker transaction sector generation:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      
      if (finalLogId) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage);
      }
      
      return {
        success: false,
        message: `Sector generation failed: ${errorMessage}`
      };
    }
  }

  /**
   * Filter dates that need processing (pre-check existing output)
   * OPTIMIZED: Only check main folder (broker_transaction_{date}/) for speed, limit to 7 dates
   */
  private async filterCompleteDates(
    dates: string[], 
    sectors: string[]
  ): Promise<string[]> {
    console.log(`🔍 Pre-checking existing sector files (main folder only for speed)...`);
    console.log(`📊 Checking ${dates.length} dates for completeness (${sectors.length} sectors in main folder only)...`);
    
    const { listPaths } = await import('../utils/azureBlob');
    const datesToProcess: string[] = [];
    let quickSkippedCount = 0;
    
    // OPTIMIZATION: Limit to 7 most recent dates
    const MAX_DATES_TO_PROCESS = 7;
    const limitedDates = dates.slice(0, MAX_DATES_TO_PROCESS);
    
    if (dates.length > MAX_DATES_TO_PROCESS) {
      console.log(`📅 Limiting pre-check to ${MAX_DATES_TO_PROCESS} most recent dates (from ${dates.length} total)`);
    }
    
    // Process in batches for parallel checking (faster than sequential)
    const CHECK_BATCH_SIZE = 20; // Check 20 dates in parallel
    const MAX_CONCURRENT_CHECKS = 10; // Max 10 concurrent checks
    
    for (let i = 0; i < limitedDates.length; i += CHECK_BATCH_SIZE) {
      const batch = limitedDates.slice(i, i + CHECK_BATCH_SIZE);
      const batchNumber = Math.floor(i / CHECK_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(limitedDates.length / CHECK_BATCH_SIZE);
      
      // Process batch checks in parallel with concurrency limit
      const checkPromises = batch.map(async (dateSuffix) => {
        try {
          // OPTIMIZATION: Only check main folder (broker_transaction_{date}/) for speed
          // Tidak perlu check semua kombinasi investorType × marketType
          const mainFolderPrefix = `broker_transaction/broker_transaction_${dateSuffix}/`;
          
          let allFiles: string[] = [];
          let retryCount = 0;
          const maxRetries = 2;
          
          while (retryCount <= maxRetries) {
            try {
              allFiles = await listPaths({ prefix: mainFolderPrefix });
              break; // Success, exit retry loop
            } catch (error: any) {
              retryCount++;
              const isRetryable = 
                error?.code === 'PARSE_ERROR' ||
                error?.name === 'RestError' ||
                (error?.message && error.message.includes('aborted'));
              
              if (!isRetryable || retryCount > maxRetries) {
                // Not retryable or max retries reached - assume incomplete
                allFiles = [];
                break;
              }
              
              // Small delay before retry (500ms)
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          if (allFiles.length > 0) {
            // Filter hanya sector CSV files yang ada di list sectors
            // Exclude: broker files (2-3 letter codes), IDX.csv
            // IMPORTANT: Convert sectors to uppercase for case-insensitive comparison
            const sectorsUpper = sectors.map(s => s.toUpperCase());
            
            const sectorFiles = allFiles.filter(file => {
              const fileName = file.split('/').pop() || '';
              if (!fileName.endsWith('.csv')) return false;
              if (fileName.toUpperCase() === 'IDX.CSV') return false;
              
              // Check if file name is a known sector name (case-insensitive)
              const nameWithoutExt = fileName.replace('.csv', '').toUpperCase();
              return sectorsUpper.includes(nameWithoutExt);
            });
            
            // Jika sudah ada {sectors.length} sector files → anggap complete (skip)
            if (sectorFiles.length >= sectors.length) {
              return { dateSuffix, isComplete: true };
            }
          }
          
          // If not complete, needs processing
          return { dateSuffix, isComplete: false };
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
          quickSkippedCount++;
          // Only log first few and last few to avoid spam
          if (quickSkippedCount <= 5 || quickSkippedCount > limitedDates.length - 5) {
            console.log(`⏭️ Date ${result.dateSuffix}: Quick skip (${sectors.length} sectors found in main folder)`);
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
        console.log(`📊 Checked ${Math.min(i + CHECK_BATCH_SIZE, limitedDates.length)}/${limitedDates.length} dates (${quickSkippedCount} skipped, ${datesToProcess.length} to process)...`);
      }
    }
    
    // Summary log
    console.log(`📊 Pre-check complete:`);
    console.log(`   ⚡ Quick skip: ${quickSkippedCount} dates (${sectors.length} sectors found in main folder)`);
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
}

