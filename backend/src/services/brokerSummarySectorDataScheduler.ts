import { BrokerSummarySectorCalculator } from '../calculations/broker/broker_summary_sector';
import { SchedulerLogService } from './schedulerLogService';
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

export class BrokerSummarySectorDataScheduler {
  private calculator: BrokerSummarySectorCalculator;

  constructor() {
    this.calculator = new BrokerSummarySectorCalculator();
  }

  /**
   * Generate sector CSV for all dates, market types, and sectors
   * @param _scope 'all' to process all available dates (reserved for future use)
   */
  async generateBrokerSummarySectorData(_scope: 'all' = 'all', logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message?: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_summary_sector',
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
      console.log('🔄 Generating Broker Summary Sector (aggregated by sector)...');
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Broker Summary Sector calculation...'
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

      // Process each date, then all market types, then all sectors for that date
      const marketTypes: Array<'' | 'RG' | 'TN' | 'NG'> = ['', 'RG', 'TN', 'NG'];

      // OPTIMIZATION: Pre-check which dates already have all sectors for all market types
      const datesToProcess = await this.filterCompleteDates(dates, sectors, marketTypes);
      
      if (datesToProcess.length === 0) {
        console.log('✅ All dates already have complete sector files - nothing to process');
        return {
          success: true,
          message: `All dates already have complete sector files - nothing to process`,
          data: {}
        };
      }

      console.log(`📊 After pre-check: ${datesToProcess.length} dates need processing (${dates.length - datesToProcess.length} already complete)`);

      // Estimate total brokers: average brokers per date * dates * market types * sectors
      // Typical broker count per date is around 100-150, we'll use 120 as average
      const avgBrokersPerDate = 120;
      const estimatedTotalBrokers = dates.length * marketTypes.length * sectors.length * avgBrokersPerDate;
      
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
        
        // For each market type
        for (let marketIdx = 0; marketIdx < marketTypes.length; marketIdx++) {
          const marketTypeValue = marketTypes[marketIdx];
          if (marketTypeValue === undefined) continue;
          
          const marketType: '' | 'RG' | 'TN' | 'NG' = marketTypeValue;
          const marketKey: string = marketType || 'all';
          console.log(`\n  🔄 Processing ${marketType || 'All Trade'} market (${marketIdx + 1}/${marketTypes.length})...`);
          
          // Initialize results for this date + market
          if (!dateResults[marketKey]) {
            dateResults[marketKey] = {};
          }
          
          // For each sector (process all sectors for this date + market)
          for (let sectorIdx = 0; sectorIdx < sectors.length; sectorIdx++) {
            const sectorNameValue = sectors[sectorIdx];
            if (!sectorNameValue) continue;
            
            const sectorName: string = sectorNameValue;
            console.log(`\n    📊 Processing sector ${sectorName} (${sectorIdx + 1}/${sectors.length})...`);
            
            // Update progress
            if (finalLogId) {
              const dateProgress = dateIdx / datesToProcess.length;
              const marketProgress = marketIdx / marketTypes.length;
              const sectorProgress = sectorIdx / sectors.length;
              const overallProgress = (dateProgress + (marketProgress + sectorProgress / marketTypes.length) / datesToProcess.length) * 100;
              await SchedulerLogService.updateLog(finalLogId, {
                progress_percentage: Math.min(100, Math.round(overallProgress)),
                current_processing: `Processing ${dateSuffix}, ${marketType || 'All Trade'} market, sector ${sectorName} (${sectorIdx + 1}/${sectors.length}, ${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers)...`
              });
            }
            
            // Process single date + sector (not batch)
            try {
              const result = await this.calculator.generateSector(
                dateSuffix,
                sectorName as string,
                marketType as '' | 'RG' | 'TN' | 'NG'
              );
              
              // Store result
              dateResults[marketKey][sectorName] = result;
              
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
              dateResults[marketKey][sectorName] = {
                success: false,
                message: errorMsg
              };
            }
          }
          
          console.log(`  ✅ ${marketType || 'All Trade'}: Completed all sectors for ${dateSuffix}`);
        }
        
        console.log(`✅ Date ${dateSuffix}: Completed all market types and sectors`);
        
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
          results[dateSuffix] = dateRes;
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
          await SchedulerLogService.markFailed(finalLogId, `Sector generation failed: ${totalFailed} failed across ${marketTypes.length} market types and ${sectors.length} sectors`);
        }
      }

      return {
        success: finalSuccess,
        message: `Sector generation completed: ${totalSuccess} success, ${totalSkipped} skipped, ${totalFailed} failed across ${marketTypes.length} market types and ${sectors.length} sectors`,
        data: results
      };
    } catch (error: any) {
      console.error('❌ Broker Summary Sector generation failed:', error?.message || error);
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
   * Generate sector CSV for a specific date, market type, and sector
   * @param dateSuffix Date in YYYYMMDD format
   * @param sectorName Sector name
   * @param marketType Market type: '' (all), 'RG', 'TN', or 'NG'
   */
  async generateBrokerSummarySectorForDate(dateSuffix: string, sectorName: string, marketType: '' | 'RG' | 'TN' | 'NG' = ''): Promise<{ success: boolean; message?: string; file?: string }> {
    try {
      console.log(`🔄 Generating ${sectorName} sector for date ${dateSuffix}, market ${marketType || 'All Trade'}...`);
      const result = await this.calculator.generateSector(dateSuffix, sectorName, marketType);
      
      if (result.success) {
        console.log(`✅ Sector generation completed for ${sectorName}, ${dateSuffix}, ${marketType || 'All Trade'}`);
      } else {
        console.error(`❌ Sector generation failed for ${sectorName}, ${dateSuffix}, ${marketType || 'All Trade'}:`, result.message);
      }
      
      return result;
    } catch (error: any) {
      console.error(`❌ Error generating ${sectorName} sector for ${dateSuffix}, ${marketType || 'All Trade'}:`, error?.message || error);
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
   * Pre-check which dates already have all sectors for all market types
   * OPTIMIZED: Quick check dulu (count sector files di folder utama), baru full check jika perlu
   * Strategy:
   * 1. Quick check: Count sector files di broker_summary/broker_summary_{date}/
   *    - Jika sudah ada {sectors.length} sector files → langsung skip (anggap complete)
   * 2. Jika belum lengkap → full check (cek semua market types × semua sectors)
   */
  private async filterCompleteDates(
    dates: string[], 
    sectors: string[], 
    marketTypes: Array<'' | 'RG' | 'TN' | 'NG'>
  ): Promise<string[]> {
    console.log(`🔍 Pre-checking existing sector files (optimized batch checking)...`);
    console.log(`📊 Checking ${dates.length} dates for completeness (${marketTypes.length} market types × ${sectors.length} sectors each)...`);
    
    const { listPaths } = await import('../utils/azureBlob');
    const { exists } = await import('../utils/azureBlob');
    const datesToProcess: string[] = [];
    let quickSkippedCount = 0;
    let fullCheckCount = 0;
    let fullSkippedCount = 0;
    
    // Process in batches for parallel checking (faster than sequential)
    const CHECK_BATCH_SIZE = 20; // Check 20 dates in parallel
    const MAX_CONCURRENT_CHECKS = 10; // Max 10 concurrent checks
    
    for (let i = 0; i < dates.length; i += CHECK_BATCH_SIZE) {
      const batch = dates.slice(i, i + CHECK_BATCH_SIZE);
      const batchNumber = Math.floor(i / CHECK_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(dates.length / CHECK_BATCH_SIZE);
      
      // Process batch checks in parallel with concurrency limit
      const checkPromises = batch.map(async (dateSuffix) => {
        try {
          // STEP 1: QUICK CHECK - Count sector files di folder utama (broker_summary/)
          const mainFolderPrefix = `broker_summary/broker_summary_${dateSuffix}`;
          
          try {
            // List semua files di folder utama dengan retry logic
            let allFiles: string[] = [];
            let retryCount = 0;
            const maxRetries = 2; // Quick check: hanya 2 retries (lebih cepat)
            
            while (retryCount <= maxRetries) {
              try {
                allFiles = await listPaths({ prefix: `${mainFolderPrefix}/` });
                break; // Success, exit retry loop
              } catch (error: any) {
                retryCount++;
                const isRetryable = 
                  error?.code === 'PARSE_ERROR' ||
                  error?.name === 'RestError' ||
                  (error?.message && error.message.includes('aborted'));
                
                if (!isRetryable || retryCount > maxRetries) {
                  // Not retryable or max retries reached - skip quick check, go to full check
                  allFiles = [];
                  break;
                }
                
                // Small delay before retry (500ms for quick check)
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
            
            if (allFiles.length > 0) {
              // Filter hanya sector CSV files yang ada di list sectors
              // Exclude: stock files (4-letter codes), IDX.csv, ALLSUM files
              // IMPORTANT: Convert sectors to uppercase for case-insensitive comparison
              const sectorsUpper = sectors.map(s => s.toUpperCase());
              
              const sectorFiles = allFiles.filter(file => {
                const fileName = file.split('/').pop() || '';
                if (!fileName.endsWith('.csv')) return false;
                if (fileName.toUpperCase() === 'IDX.CSV') return false;
                if (fileName.toUpperCase().includes('ALLSUM')) return false;
                
                // Check if file name is a known sector name (case-insensitive)
                const nameWithoutExt = fileName.replace('.csv', '').toUpperCase();
                return sectorsUpper.includes(nameWithoutExt);
              });
              
              // Jika sudah ada {sectors.length} sector files → anggap complete (quick skip)
              if (sectorFiles.length >= sectors.length) {
                return { dateSuffix, isComplete: true, checkType: 'quick' };
              }
            }
          } catch (error) {
            // Jika listPaths gagal setelah retry, lanjut ke full check
            // Silent fail - tidak perlu log karena ini normal jika folder belum ada
          }
          
          // STEP 2: FULL CHECK - Hanya jika quick check tidak complete
          // Check if ALL sectors exist for ALL market types
          let allComplete = true;
          
          for (const marketType of marketTypes) {
            const marketLower = marketType.toLowerCase();
            const folderPrefix = marketType === '' 
              ? `broker_summary/broker_summary_${dateSuffix}`
              : `broker_summary_${marketLower}/broker_summary_${marketLower}_${dateSuffix}`;
            
            // Quick check: sample first 3 sectors (if all exist, check all)
            const sampleSectors = sectors.slice(0, Math.min(3, sectors.length));
            let sampleAllExist = true;
            
            for (const sectorName of sampleSectors) {
              const sectorFilePath = `${folderPrefix}/${sectorName}.csv`;
              try {
                const sectorExists = await exists(sectorFilePath);
                if (!sectorExists) {
                  sampleAllExist = false;
                  break;
                }
              } catch (error) {
                sampleAllExist = false;
                break;
              }
            }
            
            if (!sampleAllExist) {
              allComplete = false;
              break;
            }
            
            // If sample check passed, verify ALL sectors exist
            for (const sectorName of sectors) {
              const sectorFilePath = `${folderPrefix}/${sectorName}.csv`;
              try {
                const sectorExists = await exists(sectorFilePath);
                if (!sectorExists) {
                  allComplete = false;
                  break;
                }
              } catch (error) {
                allComplete = false;
                break;
              }
            }
            
            if (!allComplete) {
              break;
            }
          }
          
          return { dateSuffix, isComplete: allComplete, checkType: allComplete ? 'full' : 'none' };
        } catch (error) {
          // If check fails, assume incomplete (safer to process than skip)
          return { dateSuffix, isComplete: false, checkType: 'error' };
        }
      });
      
      // Limit concurrency for checks
      const checkResults: Array<{ dateSuffix: string; isComplete: boolean; checkType: string }> = [];
      for (let j = 0; j < checkPromises.length; j += MAX_CONCURRENT_CHECKS) {
        const concurrentChecks = checkPromises.slice(j, j + MAX_CONCURRENT_CHECKS);
        const results = await Promise.all(concurrentChecks);
        checkResults.push(...results);
      }
      
      // Process results
      for (const result of checkResults) {
        if (result.isComplete) {
          if (result.checkType === 'quick') {
            quickSkippedCount++;
            // Only log first few and last few to avoid spam
            if (quickSkippedCount <= 5 || quickSkippedCount > dates.length - 5) {
              console.log(`⏭️ Date ${result.dateSuffix}: Quick skip (${sectors.length} sectors found in main folder)`);
            }
          } else {
            fullSkippedCount++;
            if (fullSkippedCount <= 5 || fullSkippedCount > dates.length - 5) {
              console.log(`⏭️ Date ${result.dateSuffix}: Full check skip (all sectors exist for all market types)`);
            }
          }
        } else {
          if (result.checkType === 'full') {
            fullCheckCount++;
          }
          // Only log first few to avoid spam
          if (datesToProcess.length < 5) {
            console.log(`✅ Date ${result.dateSuffix} needs processing`);
          }
          datesToProcess.push(result.dateSuffix);
        }
      }
      
      // Progress update for large batches
      if (totalBatches > 1 && batchNumber % 5 === 0) {
        console.log(`📊 Checked ${Math.min(i + CHECK_BATCH_SIZE, dates.length)}/${dates.length} dates (${quickSkippedCount + fullSkippedCount} skipped, ${datesToProcess.length} to process)...`);
      }
    }
    
    // Summary log
    console.log(`📊 Pre-check complete:`);
    console.log(`   ⚡ Quick skip: ${quickSkippedCount} dates (${sectors.length} sectors found in main folder)`);
    console.log(`   🔍 Full check: ${fullCheckCount} dates (needed detailed verification)`);
    console.log(`   ⏭️  Full skip: ${fullSkippedCount} dates (all sectors exist for all market types)`);
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
      message: 'Broker Summary Sector service is ready to generate data'
    };
  }
}

export default BrokerSummarySectorDataScheduler;

