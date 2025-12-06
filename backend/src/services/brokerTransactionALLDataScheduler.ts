import { BrokerTransactionALLCalculator } from '../calculations/broker/broker_transaction_ALL';
import { SchedulerLogService } from './schedulerLogService';
import { listPaths } from '../utils/azureBlob';
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

export class BrokerTransactionALLDataScheduler {
  private calculator: BrokerTransactionALLCalculator;

  constructor() {
    this.calculator = new BrokerTransactionALLCalculator();
  }

  /**
   * Get list of available dates from broker_transaction folders
   */
  private async getAvailableDates(): Promise<string[]> {
    try {
      const allFiles = await listPaths({ prefix: 'broker_transaction/' });
      
      if (allFiles.length === 0) {
        console.log('⚠️ No files found in broker_transaction/');
        return [];
      }

      const dates = new Set<string>();
      
      // Extract dates from folder names
      // Patterns: broker_transaction/broker_transaction_{date}/, broker_transaction/broker_transaction_{inv}_{date}/, etc.
      for (const file of allFiles) {
        const parts = file.split('/');
        if (parts.length >= 2) {
          const folderName = parts[1]; // broker_transaction_{date} or broker_transaction_{inv}_{date}
          
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

      console.log(`📅 Found ${sortedDates.length} unique dates in broker_transaction/`);
      return sortedDates;
    } catch (error) {
      console.error('❌ Error getting available dates:', error);
      return [];
    }
  }

  /**
   * Generate ALL.csv for all dates, market types, investor types, and sectors
   * @param _scope 'all' to process all available dates (reserved for future use)
   */
  async generateBrokerTransactionALLData(_scope: 'all' = 'all', logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message?: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_transaction_all',
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
      console.log('🔄 Generating Broker Transaction ALL (aggregated by sector, all emitens)...');
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Broker Transaction ALL calculation...'
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

      // Estimate total brokers: average brokers per date * dates * investor types * market types * sectors
      // Typical broker count per date is around 100-150, we'll use 120 as average
      const avgBrokersPerDate = 120;
      const estimatedTotalBrokers = dates.length * investorTypes.length * marketTypes.length * sectors.length * avgBrokersPerDate;
      
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

      // NEW LOGIC: Loop by date first, then investor type, then market type, then all sectors
      for (let dateIdx = 0; dateIdx < dates.length; dateIdx++) {
        const dateSuffix = dates[dateIdx];
        if (!dateSuffix) continue;
        
        console.log(`\n📅 Processing date ${dateSuffix} (${dateIdx + 1}/${dates.length})...`);
        
        // Initialize results for this date
        if (!results[dateSuffix]) {
          results[dateSuffix] = {};
        }
        
        // For each investor type
        for (let invIdx = 0; invIdx < investorTypes.length; invIdx++) {
          const investorTypeValue = investorTypes[invIdx];
          if (investorTypeValue === undefined) continue;
          
          {
            const investorType: '' | 'D' | 'F' = investorTypeValue;
            const invKey: string = investorType || 'all';
            
            // Initialize results for this date + investor type
            if (!results[dateSuffix][invKey]) {
              results[dateSuffix][invKey] = {};
            }
            
            // For each market type
            for (let marketIdx = 0; marketIdx < marketTypes.length; marketIdx++) {
              const marketTypeValue = marketTypes[marketIdx];
              if (marketTypeValue === undefined) continue;
              
              {
                const marketType: '' | 'RG' | 'TN' | 'NG' = marketTypeValue;
                const marketKey: string = marketType || 'all';
                console.log(`\n  🔄 Processing ${investorType || 'All'} investor, ${marketType || 'All Trade'} market (${marketIdx + 1}/${marketTypes.length})...`);
                
                // Initialize results for this date + investor type + market
                if (!results[dateSuffix][invKey][marketKey]) {
                  results[dateSuffix][invKey][marketKey] = {};
                }
                
                // For each sector (process all sectors for this date + investor type + market)
                for (let sectorIdx = 0; sectorIdx < sectors.length; sectorIdx++) {
                  const sectorNameValue = sectors[sectorIdx];
                  if (!sectorNameValue) continue;
                  
                  {
                    const sectorName: string = sectorNameValue;
                    console.log(`\n    📊 Processing sector ${sectorName} (${sectorIdx + 1}/${sectors.length})...`);
                    
                    // Update progress
                    if (finalLogId) {
                      const dateProgress = dateIdx / dates.length;
                      const invProgress = invIdx / (dates.length * investorTypes.length);
                      const marketProgress = marketIdx / (dates.length * investorTypes.length * marketTypes.length);
                      const sectorProgress = sectorIdx / (dates.length * investorTypes.length * marketTypes.length * sectors.length);
                      const overallProgress = (dateProgress + invProgress + marketProgress + sectorProgress) * 100;
                      await SchedulerLogService.updateLog(finalLogId, {
                        progress_percentage: Math.min(100, Math.round(overallProgress)),
                        current_processing: `Processing date ${dateSuffix}, ${investorType || 'All'} investor, ${marketType || 'All Trade'} market, sector ${sectorName} (${progressTracker.processedBrokers.toLocaleString()}/${estimatedTotalBrokers.toLocaleString()} brokers)...`
                      });
                    }
                    
                    // Process single date + sector (not batch)
                    try {
                      const result = await this.calculator.generateALL(
                        dateSuffix,
                        sectorName as string,
                        investorType as '' | 'D' | 'F',
                        marketType as '' | 'RG' | 'TN' | 'NG',
                        progressTracker
                      );
                      
                      // Store result
                      const dateInvMarketResults = results[dateSuffix][invKey][marketKey];
                      if (dateInvMarketResults) {
                        dateInvMarketResults[sectorName as string] = result;
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
                      const dateInvMarketResults = results[dateSuffix][invKey][marketKey];
                      if (dateInvMarketResults) {
                        dateInvMarketResults[sectorName as string] = {
                          success: false,
                          message: errorMsg
                        };
                      }
                    }
                  }
                }
                
                console.log(`  ✅ ${investorType || 'All'} investor, ${marketType || 'All Trade'}: Completed all sectors for date ${dateSuffix}`);
              }
            }
          }
        }
        
        console.log(`✅ Date ${dateSuffix}: Completed all investor types, market types, and sectors`);
      }

      const totalProcessed = totalSuccess + totalFailed + totalSkipped;
      console.log(`\n📊 ===== ALL GENERATION COMPLETED =====`);
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
          await SchedulerLogService.markFailed(finalLogId, `ALL generation failed: ${totalFailed} failed across ${investorTypes.length} investor types, ${marketTypes.length} market types and ${sectors.length} sectors`);
        }
      }

      return {
        success: finalSuccess,
        message: `ALL generation completed: ${totalSuccess} success, ${totalSkipped} skipped, ${totalFailed} failed across ${investorTypes.length} investor types, ${marketTypes.length} market types and ${sectors.length} sectors`,
        data: results
      };
    } catch (error: any) {
      console.error('❌ Error in broker transaction ALL generation:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      
      if (finalLogId) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage);
      }
      
      return {
        success: false,
        message: `ALL generation failed: ${errorMessage}`
      };
    }
  }
}

