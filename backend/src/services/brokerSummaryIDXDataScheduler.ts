import { BrokerSummaryIDXCalculator } from '../calculations/broker/broker_summary_IDX';

export class BrokerSummaryIDXDataScheduler {
  private calculator: BrokerSummaryIDXCalculator;

  constructor() {
    this.calculator = new BrokerSummaryIDXCalculator();
  }

  /**
   * Generate IDX.csv for all dates and market types
   * @param scope 'all' to process all available dates
   */
  async generateBrokerSummaryIDXData(scope: 'all' = 'all'): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      console.log('🔄 Generating Broker Summary IDX (aggregated all emiten)...');
      
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

      // Process each market type for all dates
      const marketTypes: Array<'' | 'RG' | 'TN' | 'NG'> = ['', 'RG', 'TN', 'NG'];
      let totalSuccess = 0;
      let totalFailed = 0;
      const results: any = {};

      for (const marketType of marketTypes) {
        console.log(`\n🔄 Processing ${marketType || 'All Trade'} market...`);
        const batchResult = await this.calculator.generateIDXBatch(dates, marketType);
        results[marketType || 'all'] = batchResult;
        totalSuccess += batchResult.success;
        totalFailed += batchResult.failed;
        
        console.log(`✅ ${marketType || 'All Trade'}: ${batchResult.success} success, ${batchResult.failed} failed`);
      }

      const totalProcessed = totalSuccess + totalFailed;
      console.log(`\n📊 ===== IDX GENERATION COMPLETED =====`);
      console.log(`✅ Total Success: ${totalSuccess}/${totalProcessed}`);
      console.log(`❌ Total Failed: ${totalFailed}/${totalProcessed}`);

      return {
        success: totalSuccess > 0,
        message: `IDX generation completed: ${totalSuccess} success, ${totalFailed} failed across ${marketTypes.length} market types`,
        data: results
      };
    } catch (error: any) {
      console.error('❌ Broker Summary IDX generation failed:', error?.message || error);
      return {
        success: false,
        message: error?.message || 'Unknown error'
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
          paths.forEach(path => {
            // Extract date from path like: broker_summary/broker_summary_240101/...
            const match = path.match(/broker_summary_(\d{6})/);
            if (match && match[1]) {
              // Convert YYMMDD to YYYYMMDD
              const yy = match[1].substring(0, 2);
              const mmdd = match[1].substring(2);
              // Assume 2000s (20YY)
              const yyyy = `20${yy}`;
              allDates.add(`${yyyy}${mmdd}`);
            }
          });
        } catch (error) {
          // Continue if folder doesn't exist
          console.warn(`⚠️ Could not list paths in ${folder}:`, error);
        }
      }

      return Array.from(allDates).sort().reverse(); // Newest first
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
      message: 'Broker Summary IDX service is ready to generate data'
    };
  }
}

export default BrokerSummaryIDXDataScheduler;
