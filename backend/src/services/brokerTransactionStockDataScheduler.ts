import BrokerTransactionStockCalculator from '../calculations/broker/broker_transaction_stock';

export class BrokerTransactionStockDataScheduler {
  private calculator: BrokerTransactionStockCalculator;

  constructor() {
    this.calculator = new BrokerTransactionStockCalculator();
  }

  /**
   * Generate broker transaction stock data (pivoted by stock)
   */
  async generateBrokerTransactionData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Transaction Stock calculation for: ${targetDate}`);
      
      const result = await this.calculator.generateBrokerTransactionData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Transaction Stock calculation completed successfully');
      } else {
        console.error('❌ Broker Transaction Stock calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Transaction Stock calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker transaction stock data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Transaction Stock service is ready to generate data'
    };
  }
}

export default BrokerTransactionStockDataScheduler;

