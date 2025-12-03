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
let SECTOR_MAPPING: { [key: string]: string[] } = {};

/**
 * Build sector mapping from csv_input/sector_mapping.csv
 */
async function buildSectorMappingFromCsv(): Promise<void> {
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
    
    console.log('📊 Sector mapping built successfully from CSV');
    console.log(`📊 Found ${Object.keys(SECTOR_MAPPING).length} sectors with total ${Object.values(SECTOR_MAPPING).flat().length} emitens`);
  } catch (error) {
    console.warn('⚠️ Could not build sector mapping from CSV:', error);
    console.log('⚠️ Using empty sector mapping');
    SECTOR_MAPPING = {};
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

      // NEW LOGIC: Loop by date first, then market type, then all sectors
      for (let dateIdx = 0; dateIdx < dates.length; dateIdx++) {
        const dateSuffix = dates[dateIdx];
        if (!dateSuffix) continue;
        
        console.log(`\n📅 Processing date ${dateSuffix} (${dateIdx + 1}/${dates.length})...`);
        
        // Initialize results for this date
        if (!results[dateSuffix]) {
          results[dateSuffix] = {};
        }
        
        // For each market type
        for (let marketIdx = 0; marketIdx < marketTypes.length; marketIdx++) {
          const marketTypeValue = marketTypes[marketIdx];
          if (marketTypeValue === undefined) continue;
          
          // Create explicit block scope to help TypeScript with type narrowing
          {
            const marketType: '' | 'RG' | 'TN' | 'NG' = marketTypeValue;
            const marketKey: string = marketType || 'all';
            console.log(`\n  🔄 Processing ${marketType || 'All Trade'} market (${marketIdx + 1}/${marketTypes.length})...`);
            
            // Initialize results for this date + market
            if (!results[dateSuffix][marketKey]) {
              results[dateSuffix][marketKey] = {};
            }
            
            // For each sector (process all sectors for this date + market)
            for (let sectorIdx = 0; sectorIdx < sectors.length; sectorIdx++) {
              const sectorNameValue = sectors[sectorIdx];
              if (!sectorNameValue) continue;
              
              // Create explicit block scope to help TypeScript with type narrowing
              {
                const sectorName: string = sectorNameValue;
                console.log(`\n    📊 Processing sector ${sectorName} (${sectorIdx + 1}/${sectors.length})...`);
                
                // Update progress
                if (finalLogId) {
                  const dateProgress = dateIdx / dates.length;
                  const marketProgress = marketIdx / marketTypes.length;
                  const sectorProgress = sectorIdx / sectors.length;
                  const overallProgress = (dateProgress + (marketProgress + sectorProgress / marketTypes.length) / dates.length) * 100;
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
                  const dateMarketResults = results[dateSuffix][marketKey];
                  if (dateMarketResults) {
                    dateMarketResults[sectorName as string] = result;
                  }
                  
                  // Update counters
                  if (result.success) {
                    if (result.message?.includes('already exists')) {
                      totalSkipped++;
                    } else {
                      totalSuccess++;
                    }
                  } else {
                    totalFailed++;
                  }
                  
                  // Update broker count if available
                  if (result.brokerCount && progressTracker) {
                    progressTracker.processedBrokers += result.brokerCount;
                    await progressTracker.updateProgress();
                  }
                  
                  const status = result.message?.includes('already exists') ? 'skipped' : (result.success ? 'success' : 'failed');
                  console.log(`    ${status === 'success' ? '✅' : status === 'skipped' ? '⏭️' : '❌'} ${sectorName}: ${status}${result.brokerCount ? ` (${result.brokerCount} brokers)` : ''}`);
                } catch (error: any) {
                  totalFailed++;
                  const errorMsg = error?.message || 'Unknown error';
                  console.error(`    ❌ ${sectorName}: Error - ${errorMsg}`);
                  
                  // Store error result
                  const dateMarketResults = results[dateSuffix][marketKey];
                  if (dateMarketResults) {
                    dateMarketResults[sectorName as string] = {
                      success: false,
                      message: errorMsg
                    };
                  }
                }
              }
            }
            
            console.log(`  ✅ ${marketType || 'All Trade'}: Completed all sectors for ${dateSuffix}`);
          }
        }
        
        console.log(`✅ Date ${dateSuffix}: Completed all market types and sectors`);
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
            // - broker_summary_rg/broker_summary_rg_20241021/BANK.csv
            // - broker_summary/broker_summary_20241021/BBCA.csv
            // - broker_summary/broker_summary_20241021/BANK.csv
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
      message: 'Broker Summary Sector service is ready to generate data'
    };
  }
}

export default BrokerSummarySectorDataScheduler;

