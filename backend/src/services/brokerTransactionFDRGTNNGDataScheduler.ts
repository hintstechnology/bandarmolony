import BrokerTransactionFDRGTNNGCalculator from '../calculations/broker/broker_transaction_f_d_rg_tn_ng';

export class BrokerTransactionFDRGTNNGDataScheduler {
  private calculator: BrokerTransactionFDRGTNNGCalculator;

  constructor() {
    this.calculator = new BrokerTransactionFDRGTNNGCalculator();
  }

  /**
   * Generate broker transaction F/D RG/TN/NG data (filtered by Investor Type and Board Type)
   */
  async generateBrokerTransactionData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Transaction F/D RG/TN/NG calculation for: ${targetDate}`);
      
      const result = await this.calculator.generateBrokerTransactionData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Transaction F/D RG/TN/NG calculation completed successfully');
      } else {
        console.error('❌ Broker Transaction F/D RG/TN/NG calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Transaction F/D RG/TN/NG calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker transaction F/D RG/TN/NG data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Transaction F/D RG/TN/NG service is ready to generate data'
    };
  }
}

export default BrokerTransactionFDRGTNNGDataScheduler;

