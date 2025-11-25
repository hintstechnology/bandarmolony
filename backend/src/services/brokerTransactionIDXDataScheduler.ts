import { listPaths } from '../utils/azureBlob';
import { BrokerTransactionIDXCalculator } from '../calculations/broker/broker_transaction_IDX';

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
          const dateMatch = folderName.match(/(\d{8})/);
          if (dateMatch && dateMatch[1]) {
            dates.add(dateMatch[1]);
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
   */
  async generateBrokerTransactionIDXData(_scope: 'all' = 'all'): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      console.log('🔄 Generating Broker Transaction IDX (aggregated all emiten per broker)...');
      
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

      // Process each combination of investor type and market type for all dates
      const investorTypes: Array<'D' | 'F' | ''> = ['', 'D', 'F'];
      const marketTypes: Array<'RG' | 'TN' | 'NG' | ''> = ['', 'RG', 'TN', 'NG'];
      
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
          
          // Get brokers for first date to see if this combination exists
          // If no brokers found, skip this combination
          const brokersForFirstDate = await this.getAvailableBrokers(dates[0], investorType, marketType);
          if (brokersForFirstDate.length === 0) {
            console.log(`⏭️ Skipping ${comboName} - no brokers found for this combination`);
            continue;
          }

          const batchResult = await this.calculator.generateIDXBatch(dates, investorType, marketType);
          results[comboName] = batchResult;
          totalSuccess += batchResult.success;
          totalFailed += batchResult.failed;
          totalSkipped += batchResult.skipped || 0;
          
          console.log(`✅ ${comboName}: ${batchResult.success} success, ${batchResult.skipped || 0} skipped, ${batchResult.failed} failed`);
        }
      }

      const totalProcessed = totalSuccess + totalFailed + totalSkipped;
      console.log(`\n📊 ===== BROKER TRANSACTION IDX GENERATION COMPLETED =====`);
      console.log(`✅ Total Success: ${totalSuccess}/${totalProcessed}`);
      console.log(`⏭️  Total Skipped: ${totalSkipped}/${totalProcessed}`);
      console.log(`❌ Total Failed: ${totalFailed}/${totalProcessed}`);

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
      console.error('❌ Error generating Broker Transaction IDX data:', error);
      return {
        success: false,
        message: `Failed to generate Broker Transaction IDX data: ${error.message}`
      };
    }
  }
}

