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
      await this.calculator.generateBrokerSummarySplitPerType();
      console.log('✅ Broker Summary by Type generation completed');
      return { success: true };
    } catch (error: any) {
      console.error('❌ Broker Summary by Type generation failed:', error?.message || error);
      return { success: false, message: error?.message || 'Unknown error' };
    }
  }
}

export default BrokerSummaryTypeDataScheduler;


