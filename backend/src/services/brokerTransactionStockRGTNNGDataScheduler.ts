import BrokerTransactionStockRGTNNGCalculator from '../calculations/broker/broker_transaction_stock_rg_tn_ng';

export class BrokerTransactionStockRGTNNGDataScheduler {
  private calculator: BrokerTransactionStockRGTNNGCalculator;

  constructor() {
    this.calculator = new BrokerTransactionStockRGTNNGCalculator();
  }

  /**
   * Generate broker transaction stock RG/TN/NG data (pivoted by stock, filtered by Board Type)
   */
  async generateBrokerTransactionData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Transaction Stock RG/TN/NG calculation for: ${targetDate}`);
      
      const result = await this.calculator.generateBrokerTransactionData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Transaction Stock RG/TN/NG calculation completed successfully');
      } else {
        console.error('❌ Broker Transaction Stock RG/TN/NG calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Transaction Stock RG/TN/NG calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker transaction stock RG/TN/NG data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Transaction Stock RG/TN/NG service is ready to generate data'
    };
  }
}

export default BrokerTransactionStockRGTNNGDataScheduler;

