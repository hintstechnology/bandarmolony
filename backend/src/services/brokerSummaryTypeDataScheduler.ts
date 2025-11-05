import { BrokerDataRGTNNGCalculator } from '../calculations/broker/broker_data_rg_tn_ng';

class BrokerSummaryTypeDataScheduler {
  private calculator: BrokerDataRGTNNGCalculator;

  constructor() {
    this.calculator = new BrokerDataRGTNNGCalculator();
  }

  // Generate broker summaries split per TRX_TYPE (RG/TN/NG)
  // Scope: 'all' for all available DT files
  async generateBrokerSummaryTypeData(_scope: 'all' = 'all'): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('🔄 Generating Broker Summary by Type (RG/TN/NG)...');
      const result = await this.calculator.generateBrokerSummarySplitPerType();
      console.log(`✅ Broker Summary Type calculation completed: ${result.message || 'Success'}`);
      return { success: result.success, message: result.message || 'Success' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      console.error('❌ Broker Summary by Type generation failed:', errorMessage);
      return { success: false, message: errorMessage };
    }
  }
}

export default BrokerSummaryTypeDataScheduler;


