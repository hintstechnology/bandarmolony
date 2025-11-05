import BrokerTransactionCalculator from '../calculations/broker/broker_transaction';

export class BrokerTransactionDataScheduler {
  private calculator: BrokerTransactionCalculator;

  constructor() {
    this.calculator = new BrokerTransactionCalculator();
  }

  /**
   * Generate broker transaction data
   */
  async generateBrokerTransactionData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Transaction calculation for: ${targetDate}`);
      
      const result = await this.calculator.generateBrokerTransactionData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Transaction calculation completed successfully');
      } else {
        console.error('❌ Broker Transaction calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Transaction calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker transaction data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Transaction service is ready to generate data'
    };
  }
}

export default BrokerTransactionDataScheduler;

