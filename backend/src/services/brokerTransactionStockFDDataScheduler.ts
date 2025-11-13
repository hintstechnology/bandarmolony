import BrokerTransactionStockFDCalculator from '../calculations/broker/broker_transaction_stock_f_d';

export class BrokerTransactionStockFDDataScheduler {
  private calculator: BrokerTransactionStockFDCalculator;

  constructor() {
    this.calculator = new BrokerTransactionStockFDCalculator();
  }

  /**
   * Generate broker transaction stock F/D data (pivoted by stock, filtered by Investor Type)
   */
  async generateBrokerTransactionData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Transaction Stock F/D calculation for: ${targetDate}`);
      
      const result = await this.calculator.generateBrokerTransactionData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Transaction Stock F/D calculation completed successfully');
      } else {
        console.error('❌ Broker Transaction Stock F/D calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Transaction Stock F/D calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker transaction stock F/D data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Transaction Stock F/D service is ready to generate data'
    };
  }
}

export default BrokerTransactionStockFDDataScheduler;

