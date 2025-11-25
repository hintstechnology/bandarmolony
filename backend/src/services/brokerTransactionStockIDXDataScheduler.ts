import { listPaths } from '../utils/azureBlob';
import { BrokerTransactionStockIDXCalculator } from '../calculations/broker/broker_transaction_stock_IDX';

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
   */
  async generateBrokerTransactionStockIDXData(_scope: 'all' = 'all'): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      console.log('🔄 Generating Broker Transaction Stock IDX (aggregated all brokers per stock)...');
      
      // Get list of all dates from broker_transaction_stock folders
      const dates = await this.getAvailableDates();
      
      if (dates.length === 0) {
        console.log('⚠️ No dates found with broker transaction stock data');
        return {
          success: false,
          message: 'No dates found with broker transaction stock data'
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
          const comboName = investorType 
            ? (marketType ? `${investorType}_${marketType}` : investorType)
            : (marketType ? marketType : 'all');
          
          console.log(`\n🔄 Processing ${comboName}...`);
          
          // Check if this combination exists by checking first date
          // If no stocks found, skip this combination
          let folderPrefix: string;
          if (investorType && marketType) {
            const invPrefix = investorType === 'D' ? 'd' : 'f';
            const marketLower = marketType.toLowerCase();
            folderPrefix = `broker_transaction_stock/broker_transaction_stock_${invPrefix}_${marketLower}_${dates[0]}`;
          } else if (investorType) {
            const invPrefix = investorType === 'D' ? 'd' : 'f';
            folderPrefix = `broker_transaction_stock/broker_transaction_stock_${invPrefix}_${dates[0]}`;
          } else if (marketType) {
            const marketLower = marketType.toLowerCase();
            folderPrefix = `broker_transaction_stock/broker_transaction_stock_${marketLower}_${dates[0]}`;
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
      console.log(`\n📊 ===== BROKER TRANSACTION STOCK IDX GENERATION COMPLETED =====`);
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
      console.error('❌ Error generating Broker Transaction Stock IDX data:', error);
      return {
        success: false,
        message: `Failed to generate Broker Transaction Stock IDX data: ${error.message}`
      };
    }
  }
}

export { BrokerTransactionStockIDXDataScheduler };
export default BrokerTransactionStockIDXDataScheduler;

