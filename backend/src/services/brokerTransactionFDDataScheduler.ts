import BrokerTransactionFDCalculator from '../calculations/broker/broker_transaction_f_d';

export class BrokerTransactionFDDataScheduler {
  private calculator: BrokerTransactionFDCalculator;

  constructor() {
    this.calculator = new BrokerTransactionFDCalculator();
  }

  /**
   * Generate broker transaction F/D data (filtered by Investor Type)
   */
  async generateBrokerTransactionData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Transaction F/D calculation for: ${targetDate}`);
      
      const result = await this.calculator.generateBrokerTransactionData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Transaction F/D calculation completed successfully');
      } else {
        console.error('❌ Broker Transaction F/D calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Transaction F/D calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker transaction F/D data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Transaction F/D service is ready to generate data'
    };
  }
}

export default BrokerTransactionFDDataScheduler;

