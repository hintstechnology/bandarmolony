import BrokerDataCalculator from '../calculations/broker/broker_data';

export class BrokerDataScheduler {
  private calculator: BrokerDataCalculator;

  constructor() {
    this.calculator = new BrokerDataCalculator();
  }

  /**
   * Generate broker data for all available dates
   */
  async generateBrokerData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Data calculation for: ${targetDate}`);
      
      // Broker data calculator processes all available dates
      const result = await this.calculator.generateBrokerData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Data calculation completed successfully');
      } else {
        console.error('❌ Broker Data calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Data calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Removed unused getCurrentDateSuffix method

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Data service is ready to generate data'
    };
  }
}

export default BrokerDataScheduler;

