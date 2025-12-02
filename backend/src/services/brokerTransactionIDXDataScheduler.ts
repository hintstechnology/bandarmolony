import { listPaths } from '../utils/azureBlob';
import { BrokerTransactionIDXCalculator } from '../calculations/broker/broker_transaction_IDX';
import { SchedulerLogService } from './schedulerLogService';

/**
 * Service to schedule and manage Broker Transaction IDX data generation
 * IDX.csv aggregates all emiten (stocks) for each broker into a single aggregated row
 */
export class BrokerTransactionIDXDataScheduler {
  private calculator: BrokerTransactionIDXCalculator;

  constructor() {
    this.calculator = new BrokerTransactionIDXCalculator();
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
   * Get list of available brokers from broker_transaction folders for a specific date
   */
  private async getAvailableBrokers(dateSuffix: string, investorType: 'D' | 'F' | '' = '', marketType: 'RG' | 'TN' | 'NG' | '' = ''): Promise<string[]> {
    try {
      // Determine folder path based on parameters
      let folderPrefix: string;
      if (investorType && marketType) {
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_transaction/broker_transaction_${invPrefix}_${marketLower}_${dateSuffix}`;
      } else if (investorType) {
        const invPrefix = investorType === 'D' ? 'd' : 'f';
        folderPrefix = `broker_transaction/broker_transaction_${invPrefix}_${dateSuffix}`;
      } else if (marketType) {
        const marketLower = marketType.toLowerCase();
        folderPrefix = `broker_transaction/broker_transaction_${marketLower}_${dateSuffix}`;
      } else {
        folderPrefix = `broker_transaction/broker_transaction_${dateSuffix}`;
      }

      const allFiles = await listPaths({ prefix: `${folderPrefix}/` });
      
      if (allFiles.length === 0) {
        console.log(`⚠️ No files found in ${folderPrefix}/`);
        return [];
      }

      const brokers = new Set<string>();
      
      // Extract broker codes from CSV filenames (exclude IDX.csv)
      for (const file of allFiles) {
        const fileName = file.split('/').pop() || '';
        if (fileName.endsWith('.csv') && fileName.toUpperCase() !== 'IDX.CSV') {
          const brokerCode = fileName.replace('.csv', '');
          // Only include valid broker codes (2-3 uppercase letters)
          if (brokerCode.length >= 2 && brokerCode.length <= 3 && /^[A-Z]+$/.test(brokerCode)) {
            brokers.add(brokerCode);
          }
        }
      }

      return Array.from(brokers).sort();
    } catch (error) {
      console.error(`❌ Error getting available brokers for date ${dateSuffix}:`, error);
      return [];
    }
  }

  /**
   * Generate IDX.csv for all dates, brokers, and market types
   * @param _scope 'all' to process all available dates (reserved for future use)
   * @param logId Optional log ID for progress tracking (if provided, uses existing log entry)
   * @param triggeredBy Optional trigger source for logging
   */
  async generateBrokerTransactionIDXData(_scope: 'all' = 'all', logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message?: string; data?: any }> {
    // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
    let finalLogId = logId;
    if (!finalLogId) {
      const logEntry = await SchedulerLogService.createLog({
        feature_name: 'broker_transaction_idx',
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
      console.log('🔄 Generating Broker Transaction IDX (aggregated all emiten per broker)...');
      
      if (finalLogId) {
        await SchedulerLogService.updateLog(finalLogId, {
          progress_percentage: 0,
          current_processing: 'Starting Broker Transaction IDX calculation...'
        });
      }
      
      // Get list of all dates from broker_transaction folders
      const dates = await this.getAvailableDates();
      
      if (dates.length === 0) {
        console.log('⚠️ No dates found with broker transaction data');
        // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
        const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
        if (finalLogId && !isFromPhase) {
          await SchedulerLogService.markFailed(finalLogId, 'No dates found with broker transaction data');
        }
        return {
          success: false,
          message: 'No dates found with broker transaction data'
        };
      }

      console.log(`📅 Found ${dates.length} dates to process`);

      // Process each combination of investor type and market type for all dates
      const investorTypes: Array<'D' | 'F' | ''> = ['', 'D', 'F'];
      const marketTypes: Array<'RG' | 'TN' | 'NG' | ''> = ['', 'RG', 'TN', 'NG'];
      
      const totalCombinations = investorTypes.length * marketTypes.length;
      let processedCombinations = 0;
      
      let totalSuccess = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      const results: any = {};

      for (const investorType of investorTypes) {
        for (const marketType of marketTypes) {
          // Skip invalid combinations (both can't be empty together if one is specified)
          // Actually, all combinations are valid
          
          const comboName = investorType 
            ? (marketType ? `${investorType}_${marketType}` : investorType)
            : (marketType ? marketType : 'all');
          
          console.log(`\n🔄 Processing ${comboName}...`);
          
          if (finalLogId) {
            await SchedulerLogService.updateLog(finalLogId, {
              progress_percentage: Math.round((processedCombinations / totalCombinations) * 100),
              current_processing: `Processing ${comboName}...`
            });
          }
          
          // Get brokers for first date to see if this combination exists
          // If no brokers found, skip this combination
          const firstDate = dates[0];
          if (!firstDate) {
            console.log(`⏭️ Skipping ${comboName} - no dates available`);
            processedCombinations++;
            continue;
          }
          const brokersForFirstDate = await this.getAvailableBrokers(firstDate, investorType, marketType);
          if (brokersForFirstDate.length === 0) {
            console.log(`⏭️ Skipping ${comboName} - no brokers found for this combination`);
            processedCombinations++;
            continue;
          }

          const batchResult = await this.calculator.generateIDXBatch(dates, investorType, marketType);
          results[comboName] = batchResult;
          totalSuccess += batchResult.success;
          totalFailed += batchResult.failed;
          totalSkipped += batchResult.skipped || 0;
          
          processedCombinations++;
          console.log(`✅ ${comboName}: ${batchResult.success} success, ${batchResult.skipped || 0} skipped, ${batchResult.failed} failed`);
        }
      }

      const totalProcessed = totalSuccess + totalFailed + totalSkipped;
      console.log(`\n📊 ===== BROKER TRANSACTION IDX GENERATION COMPLETED =====`);
      console.log(`✅ Total Success: ${totalSuccess}/${totalProcessed}`);
      console.log(`⏭️  Total Skipped: ${totalSkipped}/${totalProcessed}`);
      console.log(`❌ Total Failed: ${totalFailed}/${totalProcessed}`);

      // Check if this is called from a Phase (don't mark completed/failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
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
      console.error('❌ Error generating Broker Transaction IDX data:', errorMessage);
      // Check if this is called from a Phase (don't mark failed if so, Phase will handle it)
      const isFromPhase = triggeredBy && triggeredBy.startsWith('phase');
      if (finalLogId && !isFromPhase) {
        await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
      }
      return {
        success: false,
        message: `Failed to generate Broker Transaction IDX data: ${errorMessage}`
      };
    }
  }
}

